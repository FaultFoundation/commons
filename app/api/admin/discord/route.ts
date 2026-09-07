import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireStaffApi } from "@/lib/admin-api";

export const dynamic = "force-dynamic";

async function proxy(request: Request) {
  const gate = await requireStaffApi("manageTournaments");
  if (!gate.ok) return gate.response;
  const { env } = getCloudflareContext();
  if (request.method === "POST" && request.headers.get("Origin") !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({error:"Invalid origin"},{status:403});
  if (!env.CEN_SCRAPER_URL || !env.CEN_REFRESH_SECRET) return Response.json({error:"Tournament collector is not configured"},{status:503});
  const base = (/^https:\/\//.test(env.CEN_SCRAPER_URL) ? env.CEN_SCRAPER_URL : `https://${env.CEN_SCRAPER_URL}`).replace(/\/$/,"");
  const id = new URL(request.url).searchParams.get("id");
  const url = `${base}/discord/admin${id ? `?id=${encodeURIComponent(id)}` : ""}`;
  let body: string | undefined;
  if (request.method === "POST") {
    const input = await request.json().catch(() => null) as {id?:unknown;action?:unknown;targetId?:unknown}|null;
    if (!input || typeof input.id !== "string" || (input.action !== "retry" && input.action !== "ignore" && input.action !== "reparse")) return Response.json({error:"Invalid action"},{status:400});
    body = JSON.stringify({id:input.id,action:input.action,targetId:typeof input.targetId === "string" ? input.targetId : null,actor:gate.userId});
  }
  try {
    const response = await fetch(url,{method:request.method,headers:{Authorization:`Bearer ${env.CEN_REFRESH_SECRET}`,"Content-Type":"application/json"},body,signal:AbortSignal.timeout(15000),cache:"no-store"});
    return Response.json(await response.json(),{status:response.status,headers:{"Cache-Control":"no-store"}});
  } catch { return Response.json({error:"Tournament collector is unavailable"},{status:502}); }
}
export const GET = proxy;
export const POST = proxy;
