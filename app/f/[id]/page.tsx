import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { OAuthPopupBridge } from "@/components/dashboard/accounts/OAuthPopupBridge";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import {
  SignupFormView,
  type MemberCheck,
} from "@/components/dashboard/forms/SignupFormView";
import { Markdown } from "@/components/dashboard/tournaments/Markdown";
import { user } from "@/db/schema";
import { getDb } from "@/lib/db";
import { withNext } from "@/lib/next-path";
import { getSessionCached } from "@/lib/session";
import {
  checkRequirements,
  formAcceptsResponses,
  getFormCached,
  getMyResponse,
  listFormItemsCached,
  type SignupForm,
} from "@/lib/signup-forms";
import {
  EVENT_PLATFORMS,
  REQUIREMENTS,
  formPath,
  isQuestionKind,
  type Answer,
  type FormItem,
} from "@/lib/signup-forms-shared";

// Per member: requirement state and their own response.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const form = await getFormCached((await params).id);
  return {
    title: form && form.status !== "draft" ? form.title : "Sign Up",
    robots: { index: false },
  };
}

/**
 * Signed-out visitors get the plain page shell (the portal's nav means nothing
 * before sign-in); members get the portal around it. Same split as /join/.
 */
function Shell({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  if (signedIn) {
    return (
      <DashboardShell>
        <h1 className="screen-reader-text">Sign Up</h1>
        <div className="ff-bubble-grid ff-bubble-grid--single">{children}</div>
      </DashboardShell>
    );
  }
  return (
    <main id="wp--skip-link--target" className="ff-main ff-main--fill">
      <div className="ff-container ff-section">
        <div className="ff-dash ff-join ff-join--form">
          <h1 className="screen-reader-text">Sign Up</h1>
          <div className="ff-bubble-grid ff-bubble-grid--single">{children}</div>
        </div>
      </div>
    </main>
  );
}

function closesLabel(at: Date): string {
  return `${at.toLocaleString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  })} ET`;
}

/** The form as everyone sees it — its title card. */
async function FormHeader({
  form,
  accepting,
  isOwner,
}: {
  form: SignupForm;
  accepting: boolean;
  isOwner: boolean;
}) {
  let host = form.hostName;
  if (!host) {
    const owner = await getDb()
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, form.ownerUserId))
      .limit(1);
    host = owner[0]?.name ?? null;
  }
  const platform = EVENT_PLATFORMS.find((p) => p.value === form.eventPlatform);
  const badge = accepting
    ? "Open"
    : form.status === "draft"
      ? "Draft"
      : "Closed";

  return (
    <Bubble title={form.title} span="full" actions={<span className="ff-badge">{badge}</span>}>
      {isOwner ? (
        <BubbleRow
          label="Your form"
          value={form.status === "draft" ? "Only you can see this draft." : "This is what players see."}
          action={
            <div className="ff-row__buttons">
              <a className="ff-btn ff-btn--outline ff-btn--sm" href={`/forms/${form.id}/`}>
                Edit
              </a>
              <a className="ff-btn ff-btn--outline ff-btn--sm" href={`/forms/${form.id}/responses/`}>
                Responses
              </a>
            </div>
          }
        />
      ) : null}
      {host ? <BubbleRow label="Hosted by" value={host} /> : null}
      {form.description ? (
        <div className="ff-form-desc">
          <Markdown source={form.description} />
        </div>
      ) : null}
      {form.eventUrl ? (
        <BubbleRow
          label="Event"
          value={platform ? `On ${platform.label}` : "Event page"}
          action={
            <a
              className="ff-btn ff-btn--outline ff-btn--sm"
              href={form.eventUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open
            </a>
          }
        />
      ) : null}
      {form.closesAt ? (
        <BubbleRow
          label={accepting ? "Sign-ups close" : "Sign-ups closed"}
          value={closesLabel(form.closesAt)}
        />
      ) : null}
    </Bubble>
  );
}

/** Every line of "The organizer will see", in the order the form asks. */
function sharesFor(items: FormItem[]): string[] {
  const lines = ["Your display name"];
  for (const def of REQUIREMENTS) {
    const item = items.find((i) => i.kind === def.kind);
    if (item) lines.push(item.required ? def.shares : `${def.shares} (optional)`);
  }
  if (items.some((i) => isQuestionKind(i.kind))) lines.push("Your answers above");
  return lines;
}

export default async function SignupFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [session, form] = await Promise.all([getSessionCached(), getFormCached(id)]);
  const signedIn = Boolean(session);

  const isOwner = Boolean(session && form && session.user.id === form.ownerUserId);
  // A draft is the owner's preview; to anyone else it doesn't exist yet.
  if (!form || (form.status === "draft" && !isOwner)) {
    return (
      <Shell signedIn={signedIn}>
        <Bubble title="This Sign-Up Isn't Available" span="full">
          <p className="ff-auth__hint">
            {form
              ? "This form isn't open yet. Check back once the organizer opens it."
              : "That link isn't valid. Ask the organizer for a fresh one."}
          </p>
          <div className="ff-row__buttons">
            <a className="ff-btn ff-btn--outline" href={signedIn ? "/home/" : "/"}>
              {signedIn ? "Home" : "Back to The Commons"}
            </a>
          </div>
        </Bubble>
      </Shell>
    );
  }

  const items = await listFormItemsCached(form.id);
  const accepting = formAcceptsResponses(form);
  const header = <FormHeader form={form} accepting={accepting} isOwner={isOwner} />;

  // --- Signed out: what it takes, then sign in. ---------------------------
  if (!session) {
    const required = REQUIREMENTS.filter((def) =>
      items.some((i) => i.kind === def.kind),
    );
    return (
      <Shell signedIn={false}>
        {header}
        <Bubble title="Sign Up" span="full">
          {required.length ? (
            <>
              <p className="ff-auth__hint">You&rsquo;ll be asked for:</p>
              <ul className="ff-form-shares">
                {required.map((def) => (
                  <li key={def.kind}>{def.label}</li>
                ))}
              </ul>
            </>
          ) : null}
          <p className="ff-auth__hint">
            Sign-ups run on The Esports Commons. Anything you verify here carries over
            to every other sign-up that asks for it.
          </p>
          <div className="ff-row__buttons">
            <a className="ff-btn" href={withNext("/login/", formPath(form.id))}>
              Sign in or register to sign up
            </a>
          </div>
        </Bubble>
      </Shell>
    );
  }

  const [checks, mine] = await Promise.all([
    checkRequirements({
      subject: {
        userId: session.user.id,
        name: session.user.name,
        email: session.user.email,
        emailVerified: Boolean(session.user.emailVerified),
      },
      formId: form.id,
      items,
      headers: await headers(),
      live: false,
    }),
    getMyResponse(form.id, session.user.id),
  ]);

  // Evidence stays on the server: the member sees status lines, not the
  // snapshot shape the organizer receives.
  const memberChecks: MemberCheck[] = checks.map(({ evidence: _e, ...rest }) => rest);
  const questions = items.filter((i) => isQuestionKind(i.kind));
  const initialAnswers: Record<string, Answer> = {};
  for (const q of questions) {
    const v = mine?.values[q.id]?.value;
    if (v !== undefined) initialAnswers[q.id] = v as Answer;
  }

  return (
    <Shell signedIn>
      {/* Link buttons return here in a popup; the bridge closes it and
          refreshes this page. */}
      <OAuthPopupBridge />
      {header}
      {/* The owner always gets the whole form (disabled while not open), so a
          draft can be previewed before it's shared. */}
      {!accepting && !mine && !isOwner ? (
        <Bubble title="Sign-Ups Are Closed" span="full">
          <p className="ff-auth__hint">This form isn&rsquo;t taking sign-ups anymore.</p>
        </Bubble>
      ) : (
        <SignupFormView
          formId={form.id}
          accepting={accepting}
          checks={memberChecks}
          questions={questions}
          initialAnswers={initialAnswers}
          response={
            mine
              ? {
                  status: mine.status,
                  submittedAt: mine.submittedAt.getTime(),
                  updatedAt: mine.updatedAt.getTime(),
                }
              : null
          }
          shares={sharesFor(items)}
        />
      )}
    </Shell>
  );
}
