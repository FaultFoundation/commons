import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";

import { OAuthPopupBridge } from "@/components/dashboard/accounts/OAuthPopupBridge";
import {
  ArrowRight,
  ExternalMark,
  FormSection,
} from "@/components/dashboard/forms/FormSheet";
import {
  SignupFormView,
  type MemberCheck,
} from "@/components/dashboard/forms/SignupFormView";
import { SwitchAccountButton } from "@/components/dashboard/forms/SwitchAccountButton";
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
  FORM_STATUS_LABELS,
  REQUIREMENTS,
  formPath,
  isQuestionKind,
  type Answer,
  type FormItem,
  type FormStatus,
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
 * A page of its own for everyone, signed in or not: no site header
 * (SiteHeaderGate drops it for /f/) and no portal rail, just one survey sheet
 * above the standard footer. The link is handed to players who may never have
 * opened the portal, and the portal's chrome means nothing beside someone
 * else's event. `ff-dash` is there only so the dashboard type tokens resolve.
 * The owner's preview bar sits above the sheet, outside what players see.
 */
function Shell({ ownerBar, children }: { ownerBar?: ReactNode; children: ReactNode }) {
  return (
    <main id="wp--skip-link--target" className="ff-main ff-main--fill ff-survey">
      <div className="ff-dash ff-survey__page">
        {ownerBar}
        <article className="ff-survey__sheet">{children}</article>
        <p className="ff-survey__powered">
          Powered by <a href="/">The Esports Commons</a>
        </p>
      </div>
    </main>
  );
}

function dateTimeLabel(at: Date): string {
  return `${at.toLocaleString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  })} ET`;
}

/** The owner's way back to the builder from a preview tab. */
function OwnerBar({ form, accepting }: { form: SignupForm; accepting: boolean }) {
  const note =
    form.status === "draft"
      ? "Draft preview. Only you can see it until you open sign-ups."
      : accepting
        ? "Live. This is exactly what players see."
        : "Closed. Players can read it but can't sign up.";
  return (
    <div className="ff-survey__owner" role="note">
      <p className="ff-survey__ownertext">
        <strong>Your form</strong> · {note}
      </p>
      <div className="ff-survey__ownerlinks">
        <a className="ff-btn ff-btn--outline ff-btn--sm" href={`/forms/${form.id}/`}>
          Edit
        </a>
        <a
          className="ff-btn ff-btn--outline ff-btn--sm"
          href={`/forms/${form.id}/?tab=responses`}
        >
          Responses
        </a>
      </div>
    </div>
  );
}

/** The top of the sheet: who runs it, what it is, and who is filling it in. */
async function FormHeader({
  form,
  accepting,
  viewer,
}: {
  form: SignupForm;
  accepting: boolean;
  /** The signed-in member. The page has no header avatar, so this line is
      where they see whose sign-up it will be, and switch if it isn't theirs. */
  viewer: { name: string; email: string } | null;
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
  // An open form past its close time is closed, whatever its status says.
  const state: FormStatus = accepting ? "open" : form.status === "draft" ? "draft" : "closed";
  const closesAhead = form.closesAt ? form.closesAt.getTime() > Date.now() : false;

  return (
    <header className="ff-survey__head">
      <div className="ff-survey__eyebrow">
        <span>
          {host ? (
            <>
              Hosted by <strong>{host}</strong>
            </>
          ) : (
            "Sign-up form"
          )}
        </span>
        <span className={`ff-survey__state ff-survey__state--${state}`}>
          {FORM_STATUS_LABELS[state]}
        </span>
      </div>
      <h1 className="ff-survey__title">{form.title}</h1>
      {form.description ? (
        <div className="ff-survey__desc">
          <Markdown source={form.description} />
        </div>
      ) : null}
      {form.eventUrl || form.closesAt ? (
        <dl className="ff-survey__facts">
          {form.eventUrl ? (
            <div className="ff-survey__fact">
              <dt>Event</dt>
              <dd>
                <a href={form.eventUrl} target="_blank" rel="noopener noreferrer">
                  {platform && platform.value !== "other" ? `On ${platform.label}` : "Event page"}
                  <ExternalMark />
                </a>
              </dd>
            </div>
          ) : null}
          {form.closesAt ? (
            <div className="ff-survey__fact">
              <dt>{closesAhead ? "Sign-ups close" : "Sign-ups closed"}</dt>
              <dd>{dateTimeLabel(form.closesAt)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {viewer ? (
        <div className="ff-survey__who">
          <p>
            Signed in as <strong>{viewer.name}</strong>
            <span className="ff-survey__whomail">{viewer.email}</span>
          </p>
          <SwitchAccountButton next={formPath(form.id)} />
        </div>
      ) : null}
    </header>
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

  const isOwner = Boolean(session && form && session.user.id === form.ownerUserId);
  // A draft is the owner's preview; to anyone else it doesn't exist yet.
  if (!form || (form.status === "draft" && !isOwner)) {
    return (
      <Shell>
        <div className="ff-survey__empty">
          <h1 className="ff-survey__title">This Sign-Up Isn&rsquo;t Available</h1>
          <p className="ff-survey__lead">
            {form
              ? "This form isn't open yet. Check back once the organizer opens it."
              : "That link isn't valid. Ask the organizer for a fresh one."}
          </p>
          <a className="ff-btn ff-btn--outline" href={session ? "/home/" : "/"}>
            {session ? "Go to Home" : "Back to The Commons"}
          </a>
        </div>
      </Shell>
    );
  }

  const items = await listFormItemsCached(form.id);
  const accepting = formAcceptsResponses(form);
  const ownerBar = isOwner ? <OwnerBar form={form} accepting={accepting} /> : null;
  const header = (
    <FormHeader
      form={form}
      accepting={accepting}
      viewer={session ? { name: session.user.name, email: session.user.email } : null}
    />
  );

  // --- Signed out: what it takes, then sign in. ---------------------------
  if (!session) {
    const asked = REQUIREMENTS.flatMap((def) => {
      const item = items.find((i) => i.kind === def.kind);
      return item ? [{ def, required: item.required }] : [];
    });
    const questionCount = items.filter((i) => isQuestionKind(i.kind)).length;
    return (
      <Shell>
        {header}
        <FormSection
          title="Sign In to Sign Up"
          intro="Sign-ups run on The Esports Commons. Anything you verify here carries over to every other sign-up that asks for it."
        >
          {asked.length || questionCount ? (
            <div className="ff-survey__panel">
              <p className="ff-survey__label">You&rsquo;ll be asked for</p>
              <ul className="ff-survey__list">
                {asked.map(({ def, required }) => (
                  <li key={def.kind}>
                    {def.label}
                    {required ? null : <span className="ff-survey__tag">Optional</span>}
                  </li>
                ))}
                {questionCount ? (
                  <li>
                    {questionCount === 1
                      ? "Answers to 1 question"
                      : `Answers to ${questionCount} questions`}
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
          <div className="ff-survey__submit">
            <div className="ff-survey__submitmain">
              <a
                className="ff-btn ff-survey__next"
                href={withNext("/login/", formPath(form.id))}
              >
                Sign in or create an account
                <ArrowRight />
              </a>
            </div>
          </div>
        </FormSection>
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
    <Shell ownerBar={ownerBar}>
      {header}
      {/* Link buttons return here in a popup; the bridge closes it and
          refreshes this page. It renders only a failed connect, and the
          wrapper collapses while it renders nothing. */}
      <div className="ff-survey__alert">
        <OAuthPopupBridge />
      </div>
      {/* The owner always gets the whole form (disabled while not open), so a
          draft can be previewed before it's shared. */}
      {!accepting && !mine && !isOwner ? (
        <FormSection title="Sign-Ups Are Closed">
          <p className="ff-survey__lead">This form isn&rsquo;t taking sign-ups anymore.</p>
        </FormSection>
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
