"use client";

import { useEffect, useId, useRef, useState } from "react";

import { searchSchools, type SchoolHit } from "@/app/dashboard/register/actions";

/**
 * Combobox over the seeded universities directory. Free typing is allowed;
 * picking a suggestion locks in the school id (which drives server-side
 * domain validation) until the text changes again.
 */
export function SchoolTypeahead({
  country,
  value,
  onChange,
  onPick,
}: {
  country: string;
  value: string;
  /** Text edited by hand — clears any previously picked school. */
  onChange: (text: string) => void;
  onPick: (hit: SchoolHit) => void;
}) {
  const [hits, setHits] = useState<SchoolHit[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryRef = useRef("");
  const listId = useId();

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function search(text: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    queryRef.current = text;
    if (text.trim().length < 2 || !country) {
      setHits([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const result = await searchSchools(country, text);
      // Ignore responses that raced a newer keystroke.
      if (queryRef.current !== text) return;
      setHits(result.hits);
      setActiveIndex(result.hits.length > 0 ? 0 : -1);
      setOpen(result.hits.length > 0);
    }, 200);
  }

  function pick(hit: SchoolHit) {
    setOpen(false);
    setHits([]);
    onPick(hit);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0) pick(hits[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="ff-typeahead">
      <input
        className="ff-auth__input"
        type="text"
        value={value}
        placeholder="Start typing your school's name"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          search(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          // Delay so a click on a suggestion lands before the list closes.
          setTimeout(() => setOpen(false), 150);
        }}
      />
      {open ? (
        <ul className="ff-typeahead__list" id={listId} role="listbox">
          {hits.map((hit, i) => (
            <li key={hit.id} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                className={
                  i === activeIndex
                    ? "ff-typeahead__option ff-typeahead__option--active"
                    : "ff-typeahead__option"
                }
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => pick(hit)}
              >
                {hit.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
