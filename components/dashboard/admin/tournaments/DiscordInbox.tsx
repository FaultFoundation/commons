"use client";
import { useEffect, useState } from "react";

type Row = { id:string; source_channel_id:string; posted_at:number; status:string; attempts:number; error:string|null };
type Entity = {id:string;tournament_id:string;data_json:string;locked_at:number|null};
type Inbox = {messages:Row[];entities:Entity[];budget:{reserved_microusd:number;calls:number}|null;configured:boolean;channelId:string};
// The collector derives the program (organizer + season) from the source
// server, then a game, then holds anything below the publish bar. `held` is a
// resting state, not a failure — only `needs_review` asks a human to act.
const STATUS_LABELS: Record<string,string> = {
  published:"Published", held:"Held — accumulating", needs_review:"Needs review",
  ignored:"Ignored", duplicate:"Duplicate", pending:"Queued", processing:"Processing",
};
// Actionable first, then quietly-accumulating, then the rest.
const STATUS_ORDER: Record<string,number> = { needs_review:0, held:1, published:2, pending:3, processing:3, duplicate:4, ignored:5 };
export function DiscordInbox() {
  const [data,setData] = useState<Inbox|null>(null);
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const [selected,setSelected] = useState<string|null>(null);
  const [detail,setDetail] = useState<unknown>(null);
  const [target,setTarget] = useState("");
  async function load() {
    try {
      const res = await fetch("/api/admin/discord/",{cache:"no-store"}); const body = await res.json() as Inbox & {error?:string};
      if (!res.ok) throw new Error(body.error ?? "Could not load Discord inbox");
      setData(body); setError("");
    } catch(e) { setError(e instanceof Error ? e.message : "Could not load inbox"); }
  }
  useEffect(() => { void load(); },[]);
  async function inspect(id:string) {
    setSelected(id); setDetail(null); setTarget("");
    try { const res = await fetch(`/api/admin/discord/?id=${encodeURIComponent(id)}`); const body = await res.json() as Inbox & {error?:string}; if (!res.ok) throw new Error(body.error ?? "Request failed"); setDetail(body); }
    catch(e) { setError(e instanceof Error ? e.message : "Could not load message"); }
  }
  async function act(action:"retry"|"ignore"|"reparse") {
    if (!selected) return; const id = selected; setBusy(true);
    try {
      const res = await fetch("/api/admin/discord/",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,action,targetId:action === "reparse" ? null : (target || null)})});
      const body = await res.json() as Inbox & {error?:string}; if (!res.ok) throw new Error(body.error ?? "Request failed");
      await load();
      // Re-parse re-queues the message; keep it open so its result can be watched
      // (Refresh inbox to see the fresh parse land). Retry/ignore close the panel.
      if (action === "reparse") await inspect(id); else { setDetail(null); setSelected(null); }
    } catch(e) { setError(e instanceof Error ? e.message : "Action failed"); }
    finally { setBusy(false); }
  }
  const rows = data ? [...data.messages].sort((a,b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3) || b.posted_at - a.posted_at) : [];
  const counts = { review: rows.filter(r => r.status === "needs_review").length, held: rows.filter(r => r.status === "held").length, published: rows.filter(r => r.status === "published").length };
  return <div>
    <p>The collector reads the program (organizer + season) from the source server, then the game, then updates a new or existing entry. It publishes on its own once an entry has a recognized game and a real schedule or results. Program-only and registration-only posts are <strong>held</strong> — kept and enriched by later posts, not shown yet — so only genuine ambiguities land in <strong>needs review</strong>.</p>
    <div className="ff-row" style={{display:"flex",gap:"0.5rem",alignItems:"center",flexWrap:"wrap"}}>
      <button className="ff-btn ff-btn--sm" type="button" onClick={() => void load()} disabled={busy}>Refresh inbox</button>
      {rows.length > 0 && <>
        <label>Jump to message{" "}
          <select className="ff-auth__input" value={selected ?? ""} onChange={e => { if (e.target.value) void inspect(e.target.value); }}>
            <option value="">Select a message…</option>
            {rows.map(r => <option key={r.id} value={r.id}>{new Date(r.posted_at).toLocaleDateString()} · {STATUS_LABELS[r.status] ?? r.status}{r.error ? ` · ${r.error.split("\n")[0].slice(0,48)}` : ""}</option>)}
          </select>
        </label>
        <button className="ff-btn ff-btn--sm" type="button" disabled={busy || !selected} onClick={() => void act("reparse")}>Re-parse selected</button>
      </>}
    </div>
    {error && <p role="alert">{error}</p>}
    {data && <>
      <p>{data.configured ? "Collection enabled" : "Collection waiting for bot configuration"} · {counts.review} need review · {counts.held} held · {counts.published} published · AI allowance used: ${((data.budget?.reserved_microusd ?? 0)/1000000).toFixed(2)} / $4 this month</p>
      <p className="ff-row__note">The allowance is a conservative estimate, not a Cloudflare invoice. Image and document calls count toward it.</p>
      <div className="ff-ticket-table-wrap"><table className="ff-ticket-table"><thead><tr><th>Source date</th><th>Status</th><th>Details</th><th>Review</th></tr></thead><tbody>
        {rows.map(row => <tr key={row.id}><td>{new Date(row.posted_at).toLocaleDateString()}</td><td>{STATUS_LABELS[row.status] ?? row.status.replaceAll("_"," ")}</td><td>{row.error ?? "—"}</td><td><button className="ff-btn ff-btn--sm" type="button" onClick={() => void inspect(row.id)}>Inspect</button></td></tr>)}
      </tbody></table></div>
      {data.messages.length === 0 && <p>No forwards have been collected yet.</p>}
      {selected && <section aria-label="Message review">
        <h3>Message {selected}</h3>
        <label>Associate with an existing event <select className="ff-auth__input" value={target} onChange={e => setTarget(e.target.value)}><option value="">Automatic matching</option>{data.entities.map(e => {
          const d = JSON.parse(e.data_json) as {name?:string;season?:string;division?:string};
          return <option key={e.id} value={e.id}>{[d.name,d.season,d.division].filter(Boolean).join(" · ")}{e.locked_at && e.locked_at <= Date.now() ? " (concluded)" : ""}</option>;
        })}</select></label>
        <p><strong>Re-parse</strong> re-runs the parser from scratch on this message (clears the cached extraction) — use it to reprocess a message under the current model; refresh in a few seconds to see the new result. <strong>Retry</strong> re-applies the existing extraction, optionally to the associated event above. Association applies only to messages with one extracted event; ignoring keeps the source record and any already published data.</p>
        <button className="ff-btn ff-btn--sm" type="button" disabled={busy} onClick={() => void act("reparse")}>Re-parse (fresh)</button>{" "}
        <button className="ff-btn ff-btn--sm" type="button" disabled={busy} onClick={() => void act("retry")}>Retry processing</button>{" "}
        <button className="ff-btn ff-btn--sm" type="button" disabled={busy} onClick={() => void act("ignore")}>Mark reviewed / ignore</button>{" "}
        <button className="ff-btn ff-btn--sm" type="button" disabled={busy} onClick={() => {setSelected(null);setDetail(null);}}>Close</button>
        <details open><summary>Source, extraction, and change history</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",maxHeight:"36rem",overflow:"auto"}}>{detail ? JSON.stringify(detail,null,2) : "Loading…"}</pre></details>
      </section>}
    </>}
  </div>;
}
