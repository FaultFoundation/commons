"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";

import { CopyButton } from "@/components/dashboard/forms/CopyButton";
import { FormStatusControl } from "@/components/dashboard/forms/FormOwnerControls";
import type { FormStatus } from "@/lib/signup-forms-shared";
import { usePersistentState } from "@/lib/view-state";

// ---------------------------------------------------------------------------
// The sign-up form builder's shell: one header card (back to the list, the
// form's title and state, the share link, and the Questions / Verification /
// Responses tabs with their counts), then the active tab's panel. Same shape
// as TournamentChrome: panels arrive as already-rendered nodes, only the
// active one is mounted, the open tab is remembered per form, a `?tab=` deep
// link wins over memory, and a small context lets a control inside a panel
// ("Edit →" on the verification summary) switch tabs.
// ---------------------------------------------------------------------------

export const FORM_TABS = ["questions", "verification", "responses"] as const;
export type FormTabId = (typeof FORM_TABS)[number];

const TAB_LABELS: Record<FormTabId, string> = {
  questions: "Questions",
  verification: "Verification",
  responses: "Responses",
};

const STATUS_NOTES: Record<FormStatus, string> = {
  draft: "Draft — only you can open the link",
  open: "Open — anyone with the link can sign up",
  closed: "Closed — the link shows sign-ups as closed",
};

function isFormTab(value: unknown): value is FormTabId {
  return typeof value === "string" && (FORM_TABS as readonly string[]).includes(value);
}

const FormTabCtx = createContext<((tab: FormTabId) => void) | null>(null);

export function FormBuilderChrome({
  formId,
  title,
  status,
  path,
  counts,
  panels,
}: {
  formId: string;
  title: string;
  status: FormStatus;
  /** The public share path, /f/<id>/. */
  path: string;
  counts: Record<FormTabId, number>;
  panels: Record<FormTabId, ReactNode>;
}) {
  const [active, setActive] = usePersistentState<FormTabId>(
    `form-tab:${formId}`,
    "questions",
    (stored) => (isFormTab(stored) ? stored : undefined),
  );

  // Declared after the hook, so an explicit ?tab= (the list's "Responses"
  // button, the public form's owner bar) wins over the remembered tab.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (isFormTab(requested)) setActive(requested);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <FormTabCtx.Provider value={setActive}>
      <section className="ff-card ff-fbhead">
        <div className="ff-fbhead__top">
          <a className="ff-fbhead__back" href="/forms/">
            ← All forms
          </a>
          <div className="ff-fbhead__titles">
            <h1 className="ff-fbhead__title">{title}</h1>
            <p className="ff-fbhead__note">{STATUS_NOTES[status]}</p>
          </div>
          <FormStatusControl formId={formId} status={status} />
        </div>
        <div className="ff-fbhead__share">
          <span className="ff-fbhead__link">
            <span className="ff-fbhead__path">{path}</span>
            <CopyButton path={path} label="Copy" className="ff-fbhead__copy" />
          </span>
          <a
            className="ff-btn ff-btn--outline ff-btn--sm"
            href={path}
            target="_blank"
            rel="noopener"
          >
            Preview
          </a>
        </div>
        <div className="ff-fbtabs" role="tablist" aria-label="Form sections">
          {FORM_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`fbtab-${tab}`}
              aria-selected={active === tab}
              aria-controls={`fbpanel-${tab}`}
              className="ff-fbtab"
              onClick={() => setActive(tab)}
            >
              {TAB_LABELS[tab]}
              <span className="ff-fbtab__count">{counts[tab]}</span>
            </button>
          ))}
        </div>
      </section>
      <div id={`fbpanel-${active}`} role="tabpanel" aria-labelledby={`fbtab-${active}`}>
        {panels[active]}
      </div>
    </FormTabCtx.Provider>
  );
}

/** Requirement labels are Title Case headings in the registry; a chip is body
    copy, so the generic nouns drop to lowercase and the names keep theirs. */
function chipLabel(label: string): string {
  return label.replace(/\b(Account|Email|Verification|Member|Server|Profile|Rank)\b/g, (w) =>
    w.toLowerCase(),
  );
}

/**
 * "Players verify before answering": the Questions tab's summary of the
 * Verification tab — one chip per requirement (required ones highlighted,
 * optional ones marked) and an Edit → that switches tabs.
 */
export function VerificationSummary({
  requirements,
}: {
  requirements: { label: string; required: boolean }[];
}) {
  const setTab = useContext(FormTabCtx);
  const on = requirements.length > 0;
  return (
    <div className="ff-fbverify">
      <span className={`ff-fbverify__mark${on ? " ff-fbverify__mark--on" : ""}`} aria-hidden="true">
        {on ? "✓" : ""}
      </span>
      <div className="ff-fbverify__body">
        <span className="ff-fbverify__title">
          {on ? "Players verify before answering" : "No verification — anyone signed in can answer"}
        </span>
        {on ? (
          <span className="ff-fbverify__chips">
            {requirements.map((r) => (
              <span
                key={r.label}
                className={`ff-fbchip${r.required ? " ff-fbchip--required" : ""}`}
              >
                {chipLabel(r.label)}
                {r.required ? "" : " · optional"}
              </span>
            ))}
          </span>
        ) : null}
      </div>
      <button type="button" className="ff-fbverify__edit" onClick={() => setTab?.("verification")}>
        {on ? "Edit" : "Add"} →
      </button>
    </div>
  );
}
