"use client";

import { useEffect, useRef, useState } from "react";

// The "getting started" onboarding, as a large modal that covers most of the
// screen — the same native <dialog> shell the two-factor step-up uses, sized up.
// It auto-opens once per browser session for a member who still has setup left,
// so a fresh sign-up lands straight into a guided checklist; the amber banner in
// the shell stays as the persistent nudge after it's dismissed.
//
// Purely presentational: the real gate on everything (teams, tournaments) is
// still server-side. Dismissal is a sessionStorage flag, so it never blocks the
// portal and never nags more than once a session.

export type SetupStep = {
  key: string;
  label: string;
  description: string;
  done: boolean;
  href: string;
  cta: string;
};

const SESSION_KEY = "ff-getstarted-seen";

export function GettingStartedDialog({ steps }: { steps: SetupStep[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  const allDone = steps.every((s) => s.done);
  const next = steps.find((s) => !s.done) ?? null;

  // Auto-open once per session while setup is unfinished.
  useEffect(() => {
    if (allDone) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      // Private mode / storage disabled — just show it this once.
    }
    if (!seen) {
      setOpen(true);
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        // ignore
      }
    }
  }, [allDone]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const completed = steps.filter((s) => s.done).length;

  return (
    <dialog
      ref={ref}
      className="ff-dialog ff-dialog--getstarted"
      onClose={() => setOpen(false)}
    >
      <div className="ff-getstarted__head">
        <span className="ff-getstarted__eyebrow">Welcome to the Commons</span>
        <h2 className="ff-dialog__title ff-getstarted__title">
          Let&rsquo;s get you set up
        </h2>
        <p className="ff-dialog__text ff-getstarted__lede">
          A few quick steps and you&rsquo;re ready to compete. You can close this
          and pick it back up any time from the banner up top.
        </p>
        <div
          className="ff-getstarted__progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={completed}
          aria-label="Setup progress"
        >
          <span
            className="ff-getstarted__progress-bar"
            style={{ width: `${(completed / steps.length) * 100}%` }}
          />
        </div>
        <span className="ff-getstarted__count">
          {completed} of {steps.length} done
        </span>
      </div>

      <ol className="ff-getstarted__steps">
        {steps.map((step) => (
          <li
            key={step.key}
            className={`ff-getstarted__step${step.done ? " ff-getstarted__step--done" : ""}`}
          >
            <span className="ff-getstarted__check" aria-hidden="true">
              {step.done ? <CheckIcon /> : null}
            </span>
            <span className="ff-getstarted__step-main">
              <span className="ff-getstarted__step-label">{step.label}</span>
              <span className="ff-getstarted__step-desc">
                {step.description}
              </span>
            </span>
            {step.done ? (
              <span className="ff-getstarted__done-tag">Done</span>
            ) : (
              <a className="ff-btn ff-btn--outline ff-btn--sm" href={step.href}>
                {step.cta}
              </a>
            )}
          </li>
        ))}
      </ol>

      <div className="ff-dialog__actions ff-getstarted__actions">
        <button
          type="button"
          className="ff-btn ff-btn--outline"
          onClick={() => setOpen(false)}
        >
          I&rsquo;ll do this later
        </button>
        {next ? (
          <a className="ff-btn" href={next.href}>
            {next.cta}
          </a>
        ) : null}
      </div>
    </dialog>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" width="14" height="14" aria-hidden="true">
      <path
        d="M3 8.5l3.2 3.2L13 4.8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
