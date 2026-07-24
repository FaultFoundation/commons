import { authorizeBotBearer } from "@/lib/bot-auth";
import { claimPendingJobs } from "@/lib/bot-outbox";

// GET /api/bot/outbox — the bot polls this for pending Discord actions (post a
// staff reply, close a channel, DM a transcript). Claimed jobs are re-offered
// after a visibility timeout if not acked. Bearer-authed (no body to sign).
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = authorizeBotBearer(request);
  if (!auth.ok) {
    return Response.json({ error: "unauthorized" }, { status: auth.status });
  }
  const jobs = await claimPendingJobs();
  return Response.json({ jobs });
}
