"use client";
import { useEffect, useState } from "react";

type Row = { id:string; source_channel_id:string; posted_at:number; status:string; attempts:number; error:string|null };
type Entity = {id:string;tournament_id:string;data_json:string;locked_at:number|null};
type Inbox = {messages:Row[];entities:Entity[];budget:{reserved_microusd:number;calls:number}|null;configured:boolean;channelId:string};
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
  async function act(action:"retry"|"ignore") {
    if (!selected) return; setBusy(true);
    try {
      const res = await fetch("/api/admin/discord/",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:selected,action,targetId:target || null})});
      const body = await res.json() as Inbox & {error?:string}; if (!res.ok) throw new Error(body.error ?? "Request failed");
      setDetail(null); setSelected(null); await load();
    } catch(e) { setError(e instanceof Error ? e.message : "Action failed"); }
    finally { setBusy(false); }
  }
  return <div>
    <p>Forwards publish automatically when their event and required details are clear. Review missing information, processing failures, and updates to concluded events here.</p>
    <button className="ff-btn ff-btn--sm" type="button" onClick={() => void load()} disabled={busy}>Refresh inbox</button>
    {error && <p role="alert">{error}</p>}
    {data && <>
      <p>{data.configured ? "Collection enabled" : "Collection waiting for bot configuration"} · {data.messages.length} recent messages · AI allowance used: ${((data.budget?.reserved_microusd ?? 0)/1000000).toFixed(2)} / $4 this month</p>
      <p className="ff-row__note">The allowance is a conservative estimate, not a Cloudflare invoice. Image and document calls count toward it.</p>
      <div className="ff-ticket-table-wrap"><table className="ff-ticket-table"><thead><tr><th>Source date</th><th>Status</th><th>Details</th><th>Review</th></tr></thead><tbody>
        {data.messages.map(row => <tr key={row.id}><td>{new Date(row.posted_at).toLocaleDateString()}</td><td>{row.status.replaceAll("_"," ")}</td><td>{row.error ?? "—"}</td><td><button className="ff-btn ff-btn--sm" type="button" onClick={() => void inspect(row.id)}>Inspect</button></td></tr>)}
      </tbody></table></div>
      {data.messages.length === 0 && <p>No forwards have been collected yet.</p>}
      {selected && <section aria-label="Message review">
        <h3>Message {selected}</h3>
        <label>Associate with an existing event <select className="ff-auth__input" value={target} onChange={e => setTarget(e.target.value)}><option value="">Automatic matching</option>{data.entities.map(e => {
          const d = JSON.parse(e.data_json) as {name?:string;season?:string;division?:string};
          return <option key={e.id} value={e.id}>{[d.name,d.season,d.division].filter(Boolean).join(" · ")}{e.locked_at && e.locked_at <= Date.now() ? " (concluded)" : ""}</option>;
        })}</select></label>
        <p>Association applies only to messages with one extracted event. Retrying preserves successful changes; ignoring keeps the source record and any already published data.</p>
        <button className="ff-btn ff-btn--sm" type="button" disabled={busy} onClick={() => void act("retry")}>Retry processing</button>{" "}
        <button className="ff-btn ff-btn--sm" type="button" disabled={busy} onClick={() => void act("ignore")}>Mark reviewed / ignore</button>{" "}
        <button className="ff-btn ff-btn--sm" type="button" disabled={busy} onClick={() => {setSelected(null);setDetail(null);}}>Close</button>
        <details open><summary>Source, extraction, and change history</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",maxHeight:"36rem",overflow:"auto"}}>{detail ? JSON.stringify(detail,null,2) : "Loading…"}</pre></details>
      </section>}
    </>}
  </div>;
}
