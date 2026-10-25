"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { updateEventDetails, updateFormHeader } from "@/app/(dashboard)/forms/actions";
import { DeleteFormButton } from "@/components/dashboard/forms/FormOwnerControls";
import {
  DESCRIPTION_MAX,
  EVENT_PLATFORMS,
  HOST_MAX,
  TITLE_MAX,
  URL_MAX,
} from "@/lib/signup-forms-shared";

const AUTOSAVE_MS = 700;

export type EventDetails = {
  hostName: string;
  eventUrl: string;
  eventPlatform: string;
  /** Epoch ms, or null for no automatic close. */
  closesAt: number | null;
};

/**
 * The Google Forms title card at the top of the Questions tab: the form's
 * title and description, edited in place and saved a moment after typing
 * stops (and when the card goes away — a tab switch). Below them, folded,
 * the event details players see on the form's header — who hosts it, where
 * it runs, when sign-ups close — and Delete.
 */
export function FormTitleCard({
  formId,
  title: initialTitle,
  description: initialDescription,
  details,
  responses,
}: {
  formId: string;
  title: string;
  description: string;
  details: EventDetails;
  responses: number;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [problem, setProblem] = useState<string | null>(null);

  const latest = useRef({ title, description });
  latest.current = { title, description };
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  async function save() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    const next = latest.current;
    if (!next.title.trim()) {
      setProblem("Give the form a title.");
      return;
    }
    dirty.current = false;
    setStatus("saving");
    const result = await updateFormHeader(formId, next);
    if (!result.ok) {
      dirty.current = true;
      setProblem(result.error);
      setStatus("idle");
      return;
    }
    setProblem(null);
    setStatus("saved");
    // The header card above shows the title too.
    router.refresh();
  }

  function edit(patch: Partial<{ title: string; description: string }>) {
    dirty.current = true;
    setStatus("idle");
    setProblem(null);
    if (patch.title !== undefined) setTitle(patch.title);
    if (patch.description !== undefined) setDescription(patch.description);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS);
  }

  useEffect(
    () => () => {
      if (dirty.current) void save();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // The description grows with its text, like Forms' — no inner scrollbar.
  useEffect(() => {
    const el = descRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [description]);

  return (
    <div className="ff-fbtitle">
      <input
        className="ff-fbtitle__title"
        value={title}
        maxLength={TITLE_MAX}
        placeholder="Form title"
        aria-label="Form title"
        onChange={(e) => edit({ title: e.target.value })}
        onBlur={() => void save()}
      />
      <textarea
        ref={descRef}
        className="ff-fbtitle__desc"
        value={description}
        maxLength={DESCRIPTION_MAX}
        rows={1}
        placeholder="Form description — dates, format, rules (Markdown)"
        aria-label="Form description"
        onChange={(e) => edit({ description: e.target.value })}
        onBlur={() => void save()}
      />
      {problem || status !== "idle" ? (
        <span className={`ff-gq__status${problem ? " ff-gq__status--error" : ""}`} role="status">
          {problem ?? (status === "saving" ? "Saving…" : "Saved")}
        </span>
      ) : null}

      <details className="ff-fbtitle__more">
        <summary className="ff-fbtitle__summary">
          <span>Event details</span>
          <span className="ff-bubble__chevron" aria-hidden="true">
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" width="12" height="12">
              <path d="M1.5 4L6 8L10.5 4" strokeWidth="1.5" />
            </svg>
          </span>
        </summary>
        <EventDetailsEditor formId={formId} initial={details} />
        <div className="ff-fbtitle__danger">
          <span className="ff-row__note">Deleting removes the form, its link and every sign-up.</span>
          <DeleteFormButton formId={formId} title={title} responses={responses} />
        </div>
      </details>
    </div>
  );
}

/** datetime-local wants local wall time, "YYYY-MM-DDTHH:mm". */
function toLocalInput(ms: number | null): string {
  if (ms == null) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Host, event platform + link, and the automatic close — one explicit Save.
 * The close time is entered in the organizer's own zone and sent as an instant,
 * so the server never guesses a zone.
 */
function EventDetailsEditor({ formId, initial }: { formId: string; initial: EventDetails }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [hostName, setHostName] = useState(initial.hostName);
  const [eventUrl, setEventUrl] = useState(initial.eventUrl);
  const [eventPlatform, setEventPlatform] = useState(initial.eventPlatform);
  // Filled after mount: the server renders in UTC, and a local-time value in
  // the first render would not match the browser's.
  const [closesAt, setClosesAt] = useState("");
  const [initialCloses, setInitialCloses] = useState("");
  useEffect(() => {
    const local = toLocalInput(initial.closesAt);
    setClosesAt(local);
    setInitialCloses(local);
  }, [initial.closesAt]);

  const dirty =
    hostName !== initial.hostName ||
    eventUrl !== initial.eventUrl ||
    eventPlatform !== initial.eventPlatform ||
    closesAt !== initialCloses;

  function onSave(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateEventDetails(formId, {
        hostName,
        eventUrl,
        eventPlatform,
        closesAt: closesAt ? new Date(closesAt).toISOString() : "",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setInitialCloses(closesAt);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSave} className="ff-form-editor">
      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}
      <label className="ff-auth__field">
        <span className="ff-auth__label">Hosted by</span>
        <input
          className="ff-auth__input"
          value={hostName}
          maxLength={HOST_MAX}
          placeholder="Your organization"
          onChange={(e) => setHostName(e.target.value)}
        />
      </label>
      <div className="ff-form-editor__pair">
        <label className="ff-auth__field">
          <span className="ff-auth__label">Event runs on</span>
          <select
            className="ff-auth__input"
            value={eventPlatform}
            onChange={(e) => setEventPlatform(e.target.value)}
          >
            <option value="">Not set</option>
            {EVENT_PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="ff-auth__field">
          <span className="ff-auth__label">Event link</span>
          <input
            className="ff-auth__input"
            type="url"
            value={eventUrl}
            maxLength={URL_MAX}
            placeholder="https://start.gg/tournament/…"
            onChange={(e) => setEventUrl(e.target.value)}
          />
        </label>
      </div>
      <label className="ff-auth__field">
        <span className="ff-auth__label">Close sign-ups automatically</span>
        <input
          className="ff-auth__input ff-auth__input--date"
          type="datetime-local"
          value={closesAt}
          onChange={(e) => setClosesAt(e.target.value)}
        />
      </label>
      <div className="ff-row__buttons">
        {saved && !dirty ? (
          <span className="ff-row__saved" role="status">
            Saved.
          </span>
        ) : null}
        <button className="ff-btn ff-btn--sm" type="submit" disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save Details"}
        </button>
      </div>
    </form>
  );
}
