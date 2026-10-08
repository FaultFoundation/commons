import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { getAccountLinksCached } from "@/lib/account-links";
import {
  REQUIRED_PROVIDERS,
  getRegistrationStateCached,
  getSetupProgressCached,
  type RegistrationState,
} from "@/lib/registration";
import { getSessionCached } from "@/lib/session";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Overfault",
  robots: { index: false },
};

const PROVIDER_LABELS: Record<(typeof REQUIRED_PROVIDERS)[number], string> = {
  discord: "Discord",
  battlenet: "Blizzard",
};

type StepRow = {
  key: string;
  label: string;
  value: string;
  note?: string;
  done: boolean;
  /** Waiting on someone else (staff, a parent): still linked, but never the
      blue "next" button, so the member carries on with the other steps. */
  waiting?: boolean;
  /** Absent when there is nothing to open (a staff-set hold). */
  href?: string;
  cta: string;
};

/**
 * Step 1's row. Only `null` and `EMAIL_SENT` are the member's move. Consent
 * and manual review wait on someone else; their links still open the academic
 * page (a consent link can be resent there, a review resubmitted).
 */
function academicRow(reg: RegistrationState | null): StepRow {
  const base = { key: "academic", label: "Academic Verification" };
  switch (reg?.status ?? null) {
    case "VERIFIED":
      return {
        ...base,
        value: reg?.schoolName ?? "Verified",
        note: "Verified.",
        done: true,
        href: "/overfault/academic/",
        cta: "Open",
      };
    case "EMAIL_SENT":
      return {
        ...base,
        value: "Code sent",
        note: reg?.schoolEmail
          ? `Enter the code we emailed to ${reg.schoolEmail}.`
          : "Enter the code we emailed you.",
        done: false,
        href: "/overfault/code/",
        cta: "Enter Code",
      };
    case "CONSENT_PENDING":
      return {
        ...base,
        value: "Awaiting consent",
        note: "Waiting for your parent or guardian to confirm by email.",
        done: false,
        waiting: true,
        href: "/overfault/academic/",
        cta: "Resend",
      };
    case "MANUAL_REVIEW":
      return {
        ...base,
        value: "In review",
        note: "Your registration needs a manual check — we've opened a ticket in Discord and will follow up there.",
        done: false,
        waiting: true,
        href: "/overfault/academic/",
        cta: "Open",
      };
    case null:
      return {
        ...base,
        value: "Not started",
        note: "Confirm your school email. Alumni and non-students can apply too.",
        done: false,
        href: "/overfault/academic/",
        cta: "Start",
      };
    default:
      return {
        ...base,
        value: "On hold",
        note: "Reach out to the staff on Discord or email support@fault.foundation.",
        done: false,
        cta: "",
      };
  }
}

/**
 * The Overfault tab's landing page: what the rest of the Commons no longer
 * asks of anyone. Signing up gets a member into the whole portal; competing
 * in Overfault is what needs a verified school, linked Discord + Blizzard
 * accounts and a team, and those steps live here.
 *
 * Renders the checklist rather than redirecting to the step still owed: the
 * dashboard loading boundary flushes the shell first, so a redirect here
 * would degrade to a blank-shell client hop on every tab click.
 */
export default async function OverfaultPage() {
  const session = await getSessionCached();
  if (!session) {
    redirect("/login/");
  }
  const userId = session.user.id;

  // All three are request-cached, and the progress read reuses the other two.
  const [reg, links, progress] = await Promise.all([
    getRegistrationStateCached(userId),
    getAccountLinksCached(userId),
    getSetupProgressCached(userId),
  ]);
  const linked = new Set(links.map((row) => row.providerId));
  const missing = REQUIRED_PROVIDERS.filter((p) => !linked.has(p));

  const rows: StepRow[] = [
    academicRow(reg),
    {
      key: "integrations",
      label: "Discord and Blizzard",
      value: missing.length
        ? missing.length === REQUIRED_PROVIDERS.length
          ? "Not linked"
          : `${PROVIDER_LABELS[missing[0]]} not linked`
        : "Both linked",
      note: missing.length
        ? "We reach players on Discord and confirm BattleTags through Blizzard."
        : undefined,
      done: progress.integrations,
      href: "/overfault/integrations/",
      cta: missing.length ? "Link" : "Open",
    },
    {
      key: "team",
      label: "Team",
      value: progress.team ? "On a team" : "Not on a team yet",
      note: progress.team
        ? undefined
        : progress.academic
          ? "Create a team or join one with an invite link."
          : "Opens once your academic email is verified.",
      done: progress.team,
      href: "/overfault/team/",
      cta: progress.team ? "Open" : "Go",
    },
  ];

  // One blue button per context: the first step the member can act on now.
  // A step waiting on staff or a parent is skipped, so the member carries on
  // with the next one meanwhile.
  const next = rows.find((row) => !row.done && !row.waiting && row.href) ?? null;
  const completed = rows.filter((row) => row.done).length;

  return (
    <>
      <h1 className="screen-reader-text">Overfault</h1>
      <div className="ff-bubble-grid">
        <Bubble
          title="Join Overfault"
          span="full"
          actions={
            <span className="ff-badge">
              {completed === rows.length
                ? "Registered"
                : `${completed} of ${rows.length} done`}
            </span>
          }
        >
          <p className="ff-auth__hint">
            Overfault is The Fault Foundation&rsquo;s collegiate Overwatch
            league. These steps are what it takes to compete on a team; you
            can pick them up and leave them whenever you like.
          </p>
          {rows.map((row) => (
            <BubbleRow
              key={row.key}
              label={row.label}
              value={row.value}
              note={row.note}
              action={
                row.href ? (
                  <a
                    className={
                      row === next
                        ? "ff-btn ff-btn--sm"
                        : "ff-btn ff-btn--outline ff-btn--sm"
                    }
                    href={row.href}
                  >
                    {row.cta}
                  </a>
                ) : undefined
              }
            />
          ))}
        </Bubble>
      </div>
    </>
  );
}
