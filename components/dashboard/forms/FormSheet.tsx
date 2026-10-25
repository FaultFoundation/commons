import type { ReactNode } from "react";

// The public sign-up form's survey sheet (/f/<id>/), in pieces the server page
// and the client form view both render. Shared like Bubble: no directive, no
// server-only imports. Styling is the .ff-survey section of styles/theme.css.

/** One block of the sheet under a hairline: its heading, then its content. */
export function FormSection({
  step,
  title,
  intro,
  aside,
  children,
}: {
  /** A numbered mark before the title; pass it only when the sheet has more
      than one section, where the numbers say what order to work in. */
  step?: number;
  title: string;
  intro?: ReactNode;
  /** Right of the heading: a count or a key. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ff-survey__section">
      <div className="ff-survey__sechead">
        <div className="ff-survey__secmain">
          <h2 className="ff-survey__sectitle">
            {step ? (
              <span className="ff-survey__step" aria-hidden="true">
                {step}
              </span>
            ) : null}
            {title}
          </h2>
          {intro ? <p className="ff-survey__secintro">{intro}</p> : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * A requirement's state at a glance: met, still to do, or not known yet (an
 * Overwatch profile nobody has checked). Decorative — the row's status text
 * always says the same thing in words.
 */
export function RequirementMark({ met }: { met: boolean | null }) {
  const state = met === true ? "met" : met === null ? "unknown" : "todo";
  return (
    <svg
      className={`ff-survey__mark ff-survey__mark--${state}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" />
      {state === "met" ? <path d="M7.5 12.5l3 3 6-6.5" /> : null}
      {state === "unknown" ? <circle className="ff-survey__markdot" cx="12" cy="12" r="2.5" /> : null}
    </svg>
  );
}

/** The forward arrow on the sheet's one submit, as on a survey's Next. */
export function ArrowRight() {
  return (
    <svg className="ff-survey__arrow" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M3 8h9.5M8.5 4l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Marks a link that leaves for another site (the event page). */
export function ExternalMark() {
  return (
    <svg className="ff-survey__ext" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M6.5 3.5H3.5v9h9v-3M9.5 3.5h3v3M12.5 3.5L7 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
