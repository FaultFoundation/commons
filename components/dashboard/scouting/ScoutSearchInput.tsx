"use client";
import { useEffect, useId, useRef, useState } from "react";
import { isScoutDirectQuery, type ScoutSuggestion, type ScoutTarget } from "@/lib/faceit-scouting-shared";

export function ScoutSearchInput({ query, target, disabled, onChange, onPick }: {
  query: string;
  target: ScoutTarget;
  disabled: boolean;
  onChange: (value: string) => void;
  onPick: (suggestion: ScoutSuggestion) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [result, setResult] = useState<{ key: string; items: ScoutSuggestion[]; message?: string } | null>(null);
  const composing = useRef(false);
  const key = `${target}:${query.trim()}`;
  const searchable = !!query.trim() && !isScoutDirectQuery(query) && query.length <= 256;
  const current = result?.key === key ? result : null;
  const items = current?.items ?? [];
  const visible = open && searchable && !disabled;

  useEffect(() => {
    if (!searchable) return;
    const controller = new AbortController();
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const timeout = setTimeout(async () => {
      deadline = setTimeout(() => {
        controller.abort();
        setResult({ key, items: [], message: "Suggestions timed out. Try again or use a FACEIT ID or link." });
      }, 8000);
      try {
        const params = new URLSearchParams({ q: query.trim(), target });
        const res = await fetch(`/api/scouting/suggestions?${params}`, { signal: controller.signal, cache: "no-store" });
        if (!res.ok) throw new Error(res.status === 401 ? "Sign in again to see suggestions." : "Suggestions unavailable. Try again or use a FACEIT ID or link.");
        const data = await res.json() as { items: ScoutSuggestion[] };
        if (!controller.signal.aborted) { setResult({ key, items: data.items }); setActive(0); }
      } catch (error) {
        if (!controller.signal.aborted) setResult({ key, items: [], message: error instanceof Error ? error.message : "Suggestions unavailable." });
      } finally { clearTimeout(deadline); }
    }, 250);
    return () => { clearTimeout(timeout); clearTimeout(deadline); controller.abort(); };
  }, [key, query, searchable, target]);

  useEffect(() => {
    if (visible && items[active]) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, items, listId, visible]);

  const pick = (item: ScoutSuggestion) => { setOpen(false); onPick(item); };
  return <div className="ff-scoutlookup">
    <input className="ff-auth__input ff-scoutsearch__input" type="text" role="combobox"
      value={query} disabled={disabled} maxLength={256}
      aria-label={target === "team" ? "FACEIT team name, ID, or link" : "FACEIT player name, ID, or link"}
      placeholder={target === "team" ? "FACEIT team name, ID, or link" : "FACEIT player name, ID, or link"}
      aria-autocomplete="list" aria-expanded={visible} aria-controls={visible ? listId : undefined}
      aria-activedescendant={visible && items[active] ? `${listId}-${active}` : undefined}
      autoComplete="off" spellCheck={false}
      onChange={e => { onChange(e.target.value); setOpen(true); setActive(0); }}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
      onKeyDown={e => {
        if (composing.current || e.nativeEvent.isComposing) return;
        if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault(); setOpen(true);
          if (items.length) setActive(index => !open ? 0 : (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length);
        }
        if (e.key === "Enter" && visible && items[active]) { e.preventDefault(); pick(items[active]); }
      }} />
    {visible && <div className="ff-scoutlookup__dropdown">
      <ul id={listId} role="listbox" aria-label={`Matching ${target === "team" ? "teams" : "players"}`}>
        {items.map((item, index) => <li key={item.id} id={`${listId}-${index}`} role="option" aria-selected={active === index}
          onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => pick(item)}>
          {item.avatarUrl ? <img src={item.avatarUrl} alt="" width={36} height={36} /> : <span className="ff-scoutlookup__avatar" aria-hidden="true">{item.name.slice(0, 2).toUpperCase()}</span>}
          <span className="ff-scoutlookup__identity"><strong>{item.name}</strong><small>{item.id}</small></span>
        </li>)}
      </ul>
      {!items.length && <p role="status">{!current ? "Finding matches…" : current.message ?? `No saved ${target === "team" ? "teams" : "players"} match. Try a FACEIT ID or link.`}</p>}
    </div>}
  </div>;
}
