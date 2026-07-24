import { and, eq, inArray, lt, or, sql } from "drizzle-orm";

import { botOutbox } from "@/db/schema";
import { getDb } from "@/lib/db";
import { linkMessageToDiscord } from "@/lib/tickets";

// ---------------------------------------------------------------------------
// Outbound work queue for the Discord bot. The bot can only make outbound
// calls, so the dashboard enqueues Discord side effects here and the bot polls
// (GET /api/bot/outbox), executes them, and acks (POST /api/bot/outbox/ack).
// A claimed-but-un-acked job (bot crashed mid-run) is re-offered after a
// visibility timeout, so nothing is lost.
// ---------------------------------------------------------------------------

export type OutboxKind = "post_message" | "close_channel" | "send_transcript";

const VISIBILITY_TIMEOUT_MS = 60_000;

export async function enqueueBotJob(
  kind: OutboxKind,
  payload: Record<string, unknown>,
  ticketId?: string | null,
): Promise<void> {
  const now = new Date();
  // Never throw: a queue failure must not fail (or hang) the dashboard action
  // that triggered it — the D1 write it accompanies has already happened.
  try {
    await getDb().insert(botOutbox).values({
      id: crypto.randomUUID(),
      kind,
      ticketId: ticketId ?? null,
      payload: JSON.stringify(payload),
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    console.error(`enqueueBotJob(${kind}) failed:`, error);
  }
}

export type OutboxJob = { id: string; kind: string; payload: unknown };

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Hand out pending (and timed-out claimed) jobs, marking them claimed. */
export async function claimPendingJobs(limit = 20): Promise<OutboxJob[]> {
  const db = getDb();
  const now = Date.now();
  const staleBefore = new Date(now - VISIBILITY_TIMEOUT_MS);

  const rows = await db
    .select({
      id: botOutbox.id,
      kind: botOutbox.kind,
      payload: botOutbox.payload,
    })
    .from(botOutbox)
    .where(
      or(
        eq(botOutbox.status, "pending"),
        and(eq(botOutbox.status, "claimed"), lt(botOutbox.claimedAt, staleBefore)),
      ),
    )
    .orderBy(botOutbox.createdAt)
    .limit(limit);

  if (rows.length === 0) return [];

  await db
    .update(botOutbox)
    .set({
      status: "claimed",
      claimedAt: new Date(now),
      attempts: sql`${botOutbox.attempts} + 1`,
      updatedAt: new Date(now),
    })
    .where(
      inArray(
        botOutbox.id,
        rows.map((row) => row.id),
      ),
    );

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    payload: safeParse(row.payload),
  }));
}

export type JobResult = { id: string; ok: boolean; discordMessageId?: string };

/** Mark acked jobs done/failed, and link posted replies to their Discord id. */
export async function completeJobs(results: JobResult[]): Promise<void> {
  if (results.length === 0) return;
  const db = getDb();

  const jobs = await db
    .select({ id: botOutbox.id, kind: botOutbox.kind, payload: botOutbox.payload })
    .from(botOutbox)
    .where(
      inArray(
        botOutbox.id,
        results.map((result) => result.id),
      ),
    );
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const now = new Date();

  for (const result of results) {
    const job = jobById.get(result.id);
    if (
      job?.kind === "post_message" &&
      result.ok &&
      result.discordMessageId
    ) {
      const payload = safeParse(job.payload) as { messageId?: string };
      if (payload.messageId) {
        await linkMessageToDiscord(payload.messageId, result.discordMessageId);
      }
    }
    await db
      .update(botOutbox)
      .set({ status: result.ok ? "done" : "failed", updatedAt: now })
      .where(eq(botOutbox.id, result.id));
  }
}
