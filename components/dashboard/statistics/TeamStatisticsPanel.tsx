"use client";
import { useEffect, useState } from "react";
import { updateStatisticsTeamLink, reportStatisticsMatchTime } from "@/app/statistics/actions";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { MatchList } from "@/components/dashboard/statistics/MatchList";
import { StatLoading } from "@/components/dashboard/statistics/StatLoading";
import { summarizeMatches } from "@/lib/match-statistics";
import type { ExternalMatchRow } from "@/lib/player-data-shared";

type TeamOption = { id: string; name: string; source: string };
type Detail = { linkedTeams?: string[]; canLink?: boolean; name: string; rosterCount: number; avgSr: number | null; matches: ExternalMatchRow[]; note: string };
export function TeamStatisticsPanel({ initialTeam }: { initialTeam: string }) {
  const [refreshing, setRefreshing] = useState(false);
  const [timeMatch, setTimeMatch] = useState("");
  const [time, setTime] = useState("");
  const [source, setSource] = useState("");
  const [timeMessage, setTimeMessage] = useState("");
  const [savingTime, setSavingTime] = useState(false);
  const [revision, setRevision] = useState(0);
  const [linkError, setLinkError] = useState("");
  const [linking, setLinking] = useState(false);
  const [external, setExternal] = useState("");
  const [teams, setTeams] = useState<{ id: string; name: string; source: string }[]>([]);
  const [team, setTeam] = useState(initialTeam);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [competition, setCompetition] = useState("");
  const [shown, setShown] = useState(25);
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/statistics/teams", { signal: abort.signal, cache: "no-store" }).then(r => {
      if (!r.ok) throw Error(); return r.json() as Promise<{ teams: TeamOption[] }>; 
    }).then(data => { setTeams(data.teams); setTeam(current => current || data.teams[0]?.id || ""); if (!data.teams.length) setLoading(false); })
      .catch(() => { if (!abort.signal.aborted) { setError(true); setLoading(false); } });
    return () => abort.abort();
  }, [initialTeam, revision]);
  useEffect(() => {
    if (!team) return;
    const abort = new AbortController();
    setDetail(null); setTimeMatch(""); setTimeMessage(""); setError(false); setLoading(true); setCompetition(""); setShown(25);
    fetch(`/api/statistics/teams?team=${encodeURIComponent(team)}`, { signal: abort.signal, cache: "no-store" }).then(r => {
      if (!r.ok) throw Error(); return r.json() as Promise<Detail>;
    }).then(data => { setDetail(data); setLoading(false); })
      .catch(() => { if (!abort.signal.aborted) { setError(true); setLoading(false); } });
    return () => abort.abort();
  }, [team, revision]);
  async function refresh() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/player-data/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({force:true}) });
      if (!response.ok) throw Error();
      setRevision(n => n + 1);
    } catch { setError(true); }
    finally { setRefreshing(false); }
  }
  async function link(id: string, remove = false) {
    setLinking(true); setLinkError("");
    try {
      const result = await updateStatisticsTeamLink(team, id, remove);
      if (result.error) setLinkError(result.error);
      else { setExternal(""); setRevision(n => n + 1); }
    } catch { setLinkError("Unable to update the team link. Try again."); }
    finally { setLinking(false); }
  }
  async function saveTime() {
    setSavingTime(true); setTimeMessage("");
    try {
      const match = detail?.matches.find(m => m.matchKey === timeMatch);
      const result = await reportStatisticsMatchTime(team, timeMatch, new Date(time).getTime(), source, match?.reportedTime?.revision ?? 0);
      if (result.error) setTimeMessage(result.error);
      else { setTime(""); setSource(""); setRevision(n => n + 1); }
    } catch { setTimeMessage("Unable to save the time. Try again."); }
    finally { setSavingTime(false); }
  }
  const matches = (detail?.matches ?? []).filter(m => !competition || m.competitionName === competition);
  const stats = summarizeMatches(matches);
  return <div className="ff-bubble-grid ff-bubble-grid--single">
    <Bubble title="Team Statistics" span="full" actions={<button className="ff-btn ff-btn--outline ff-btn--sm" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh"}</button>}>
      <label className="ff-auth__field ff-statistics-field">Team
        <select aria-label="Team" className="ff-auth__input" value={team} onChange={e => { setTeam(e.target.value); const url = new URL(location.href); url.searchParams.set("tab", "team"); url.searchParams.set("team", e.target.value); history.replaceState(history.state, "", url); }}>
          {!teams.length ? <option value="">No teams available</option> : null}
          {teams.map(t => <option key={t.id} value={t.id}>{t.name} · {t.source}</option>)}
        </select>
      </label>
      {!loading && !teams.length && !error ? <p>Join a Commons team or connect FACEIT or start.gg in <a href="/account/">Account</a> to see team statistics.</p> : null}
      {error ? <p role="alert">Unable to load these statistics. Check your team access and try again.</p> : null}
      {loading ? <StatLoading /> : null}
      {detail ? <>
        <p className="ff-bubble__note">{detail.note}</p>
        {detail.canLink ? <details className="ff-statistics-links"><summary>Connected Teams</summary>
          <label className="ff-auth__field ff-statistics-field">Link a Provider Team
            <select className="ff-auth__input" value={external} onChange={e => setExternal(e.target.value)}><option value="">Select your external team</option>{teams.filter(t => t.id.includes(":") && !detail.linkedTeams?.includes(t.id)).map(t => <option key={t.id} value={t.id}>{t.name} · {t.source}</option>)}</select>
          </label>
          <p className="ff-bubble__note">Link the same team across platforms to share its synced match history with your Commons roster.</p>
          <button className="ff-btn" disabled={!external || linking} onClick={() => void link(external)}>Link Team</button>
          {detail.linkedTeams?.map(id => <p key={id}>{teams.find(t => t.id === id)?.name ?? id} <button className="ff-btn ff-btn--outline ff-btn--sm" disabled={linking} onClick={() => void link(id, true)}>Unlink</button></p>)}
          {linkError ? <p role="alert">{linkError}</p> : null}
        </details> : null}
        <label className="ff-auth__field ff-statistics-field">Competition
          <select aria-label="Competition" className="ff-auth__input" value={competition} onChange={e => { setCompetition(e.target.value); setShown(25); }}>
            <option value="">All competitions</option>
            {[...new Set(detail.matches.map(m => m.competitionName).filter((n): n is string => !!n))].map(n => <option key={n}>{n}</option>)}
          </select>
        </label>
        <div className="ff-statistics-summary">
          {[["Record", `${stats.wins}–${stats.losses}–${stats.draws}`], ["Win Rate", stats.winRate == null ? "—" : `${stats.winRate}%`], ["Roster", detail.rosterCount], ["Average SR", detail.avgSr ?? "—"]].map(([label, value]) => <div className="ff-stat" key={label}><span className="ff-stat__label">{label}</span><span className="ff-stat__value">{value}</span></div>)}
        </div>
        <p className="ff-bubble__note">Record: wins–losses–draws from {stats.decided} finished, attributed matches.{stats.unknown ? ` ${stats.unknown} finished matches have no confirmed result.` : ""}</p>
      </> : null}
    </Bubble>
    {detail?.canLink ? <Bubble title="Shared Match Times"><details><summary>Report or Update a Match Time</summary>
      <p className="ff-bubble__note">This time is shared with everyone who views the same match in Statistics. Previous reports are retained. Times use your device timezone.</p>
      <label className="ff-auth__field ff-statistics-field">Upcoming Match<select className="ff-auth__input" value={timeMatch} onChange={e => setTimeMatch(e.target.value)}><option value="">Select a match</option>{detail.matches.filter(m => m.status === "scheduled" && m.matchKey).map(m => <option key={m.id} value={m.matchKey}>{m.competitionName} · {m.teamName} vs {m.opponentName ?? "TBD"} · {m.roundText}</option>)}</select></label>
      <label className="ff-auth__field ff-statistics-field">Date and Local Time<input className="ff-auth__input" type="datetime-local" value={time} onChange={e => setTime(e.target.value)} /></label>
      <label className="ff-auth__field ff-statistics-field">Source Link<input className="ff-auth__input" type="url" placeholder="https://…" value={source} onChange={e => setSource(e.target.value)} /></label>
      <button className="ff-btn" disabled={savingTime || !timeMatch || !time || !source} onClick={() => void saveTime()}>Save Match Time</button>
      {timeMessage ? <p role="status">{timeMessage}</p> : null}
      </details>
    </Bubble> : null}
    {detail ? <Bubble title="Match History"><MatchList matches={matches.slice(0, shown)} />{matches.length > shown ? <button className="ff-btn ff-btn--outline" onClick={() => setShown(shown + 25)}>Show More</button> : null}</Bubble> : null}
  </div>;
}
