"use client";

import { useEffect, useId, useState } from "react";

export type SchoolHit = { id: number; name: string; website: string };

type SchoolDirectoryEntry = SchoolHit & {
  country: string;
  normalizedName: string;
};

let directoryPromise: Promise<SchoolDirectoryEntry[]> | null = null;

function parseDirectory(data: unknown): SchoolDirectoryEntry[] {
  if (!Array.isArray(data)) throw new Error("School directory is not an array.");

  const ids = new Set<number>();
  return data.map((entry) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("School directory contains an invalid entry.");
    }
    const { id, country, name, website } = entry as Record<string, unknown>;
    if (
      typeof id !== "number" ||
      !Number.isInteger(id) ||
      id < 1 ||
      ids.has(id) ||
      typeof country !== "string" ||
      typeof name !== "string" ||
      typeof website !== "string"
    ) {
      throw new Error("School directory contains malformed data.");
    }
    ids.add(id);
    return {
      id,
      country,
      name,
      website,
      normalizedName: name.toLocaleLowerCase(),
    };
  });
}

function loadDirectory(): Promise<SchoolDirectoryEntry[]> {
  if (!directoryPromise) {
    directoryPromise = fetch("/schools.json")
      .then((response) => {
        if (!response.ok) throw new Error(`School directory request failed: ${response.status}`);
        return response.json();
      })
      .then(parseDirectory)
      .catch((error: unknown) => {
        directoryPromise = null;
        throw error;
      });
  }
  return directoryPromise;
}

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
  const [directory, setDirectory] = useState<SchoolDirectoryEntry[] | null>(null);
  const [directoryError, setDirectoryError] = useState(false);
  const [pickedSchool, setPickedSchool] = useState<SchoolDirectoryEntry | null>(null);
  const listId = useId();

  useEffect(() => {
    let mounted = true;
    loadDirectory()
      .then((loadedDirectory) => {
        if (mounted) setDirectory(loadedDirectory);
      })
      .catch(() => {
        if (mounted) setDirectoryError(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (pickedSchool?.name === value && pickedSchool.country === country) {
      setHits([]);
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    const query = value.trim();
    if (!directory || directoryError || !country || query.length < 2 || query.length > 120) {
      setHits([]);
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    const normalizedQuery = query.toLocaleLowerCase();
    const nextHits: SchoolHit[] = [];
    for (const school of directory) {
      if (school.country === country && school.normalizedName.includes(normalizedQuery)) {
        nextHits.push({ id: school.id, name: school.name, website: school.website });
        if (nextHits.length === 8) break;
      }
    }
    setHits(nextHits);
    setActiveIndex(nextHits.length > 0 ? 0 : -1);
    setOpen(nextHits.length > 0);
  }, [country, directory, directoryError, pickedSchool, value]);

  function pick(hit: SchoolHit) {
    const selected = directory?.find((school) => school.id === hit.id) ?? null;
    setPickedSchool(selected);
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
    <div className="ff-typeahead" aria-busy={directory === null && !directoryError}>
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
          setPickedSchool(null);
          onChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          // Delay so a click on a suggestion lands before the list closes.
          setTimeout(() => setOpen(false), 150);
        }}
      />
      {directory === null && !directoryError ? (
        <span className="screen-reader-text" role="status">
          Loading school suggestions.
        </span>
      ) : null}
      {directoryError ? (
        <p className="ff-auth__hint" role="status">
          School suggestions are unavailable. Use “My school isn&apos;t listed” below.
        </p>
      ) : null}
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
