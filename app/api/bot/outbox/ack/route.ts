import { readSignedBotBody } from "@/lib/bot-auth";
import { completeJobs, type JobResult } from "@/lib/bot-outbox";

// POST /api/bot/outbox/ack — the bot reports which jobs it finished. HMAC-signed
// body (it has one), consistent with the other bot POST routes. A post_message
// result carries the created Discord message id so the site can link it.
export const dynamic = "force-dynamic";

type AckBody = { results?: JobResult[] };

export async function POST(request: Request) {
  const parsed = await readSignedBotBody<AckBody>(request);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: parsed.status });
  }
  const results = Array.isArray(parsed.data.results) ? parsed.data.results : [];
  await completeJobs(results);
  return Response.json({ ok: true });
}
