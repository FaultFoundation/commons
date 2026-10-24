"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { updateFormDetails } from "@/app/(dashboard)/forms/actions";
import {
  DESCRIPTION_MAX,
  EVENT_PLATFORMS,
  HOST_MAX,
  TITLE_MAX,
  URL_MAX,
} from "@/lib/signup-forms-shared";

export type FormDetails = {
  title: string;
  hostName: string;
  description: string;
  eventUrl: string;
  eventPlatform: string;
  /** Epoch ms, or null for no automatic close. */
  closesAt: number | null;
};

/** datetime-local wants local wall time, "YYYY-MM-DDTHH:mm". */
function toLocalInput(ms: number | null): string {
  if (ms == null) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * The form's public header: title, host line, description, where the event
 * runs and an optional automatic close. One Save, disabled until something
 * changed. The close time is entered in the organizer's own time zone and sent
 * as an instant, so the server never has to guess a zone.
 */
export function FormDetailsEditor({
  formId,
  initial,
}: {
  formId: string;
  initial: FormDetails;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [title, setTitle] = useState(initial.title);
  const [hostName, setHostName] = useState(initial.hostName);
  const [description, setDescription] = useState(initial.description);
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
    title !== initial.title ||
    hostName !== initial.hostName ||
    description !== initial.description ||
    eventUrl !== initial.eventUrl ||
    eventPlatform !== initial.eventPlatform ||
    closesAt !== initialCloses;

  function onSave(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateFormDetails(formId, {
        title,
        hostName,
        description,
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
        <span className="ff-auth__label">Title</span>
        <input
          className="ff-auth__input"
          value={title}
          maxLength={TITLE_MAX}
          required
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="ff-auth__field">
        <span className="ff-auth__label">Hosted by (optional)</span>
        <input
          className="ff-auth__input"
          value={hostName}
          maxLength={HOST_MAX}
          placeholder="Your organization"
          onChange={(e) => setHostName(e.target.value)}
        />
      </label>
      <label className="ff-auth__field">
        <span className="ff-auth__label">Description (optional, Markdown)</span>
        <textarea
          className="ff-auth__input ff-reg__textarea"
          value={description}
          maxLength={DESCRIPTION_MAX}
          placeholder="Dates, format, rules, anything players should know before signing up."
          onChange={(e) => setDescription(e.target.value)}
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
          <span className="ff-auth__label">Event link (optional)</span>
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
        <span className="ff-auth__label">Close sign-ups automatically (optional)</span>
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
        <button className="ff-btn" type="submit" disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
