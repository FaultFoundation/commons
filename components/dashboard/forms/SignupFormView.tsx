"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  recheckOverwatch,
  submitSignup,
  withdrawSignup,
} from "@/app/f/[id]/actions";
import { LinkProviderButton } from "@/components/dashboard/LinkProviderButton";
import { ConfirmDialog } from "@/components/dashboard/bubbles/ConfirmDialog";
import {
  ArrowRight,
  FormSection,
  RequirementMark,
} from "@/components/dashboard/forms/FormSheet";
import { authClient } from "@/lib/auth-client";
import {
  LONG_ANSWER_MAX,
  SHORT_ANSWER_MAX,
  choiceConfig,
  formPath,
  normalizeAnswer,
  type Answer,
  type FormItem,
} from "@/lib/signup-forms-shared";
import type { RequirementAction, RequirementCheck } from "@/lib/signup-forms";

export type MemberCheck = Omit<RequirementCheck, "evidence">;

export type MemberResponse = {
  status: string;
  submittedAt: number;
  updatedAt: number;
} | null;

function dateLabel(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { dateStyle: "medium" });
}

/** Whether an answer would get past the submit's own validation. */
function answered(item: FormItem, value: Answer): boolean {
  const result = normalizeAnswer(item, value);
  return result.ok && result.value !== null;
}

/**
 * A member filling in a sign-up form, as the sections of the survey sheet: what
 * the organizer requires (each row saying where they stand and the one click
 * that fixes it), the organizer's questions, and exactly what will be shared
 * before they press Sign Up. Requirement state comes from the server's cached
 * checks; the submit re-checks everything live, so this page's checkmarks (and
 * the progress bar built on them) are guidance, not the gate.
 */
export function SignupFormView({
  formId,
  accepting,
  checks,
  questions,
  initialAnswers,
  response,
  shares,
}: {
  formId: string;
  accepting: boolean;
  checks: MemberCheck[];
  questions: FormItem[];
  initialAnswers: Record<string, Answer>;
  response: MemberResponse;
  shares: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [answers, setAnswers] = useState<Record<string, Answer>>(initialAnswers);
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const signedUp = response?.status === "submitted";
  const outstanding = checks.filter((c) => c.required && c.met !== true);
  // Only a definite miss disables the button. "Couldn't tell yet" (an
  // unchecked Overwatch profile) is worth a try: the submit re-checks live.
  const blocked = outstanding.filter((c) => c.met === false);
  // One blue button per context: the first unmet requirement the member can
  // act on themselves.
  const nextId = checks.find((c) => c.met !== true && c.action)?.itemId ?? null;

  // The progress bar counts what the submit needs: every required requirement
  // met and every required question answered.
  const requiredQuestions = questions.filter((q) => q.required);
  const total = checks.filter((c) => c.required).length + requiredQuestions.length;
  const done =
    checks.filter((c) => c.required && c.met === true).length +
    requiredQuestions.filter((q) => answered(q, answers[q.id] ?? null)).length;

  // Sections are numbered only when there is more than one to work through.
  const reqStep = checks.length ? 1 : 0;
  const questionStep = questions.length ? reqStep + 1 : reqStep;
  const reviewStep = questionStep + 1;
  const step = (n: number) => (reviewStep > 1 ? n : undefined);

  function set(itemId: string, value: Answer) {
    setSaved(false);
    setAnswers((prev) => ({ ...prev, [itemId]: value }));
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBlocking([]);
    setSaved(false);
    startTransition(async () => {
      const result = await submitSignup(formId, answers);
      if (!result.ok) {
        setError(result.error);
        setBlocking(result.blocking ?? []);
        // A refused submit doesn't revalidate, but the live re-check it ran
        // may have changed what the checklist should show.
        router.refresh();
        return;
      }
      // Saved: the action revalidated this page, so its response carries the
      // re-render — a router.refresh() here would fetch it a second time.
      setSaved(true);
    });
  }

  function onWithdraw() {
    startTransition(async () => {
      const result = await withdrawSignup(formId);
      setWithdrawing(false);
      // Revalidates on success; nothing to refresh on failure.
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <>
      {accepting && total ? <Progress done={done} total={total} /> : null}

      {checks.length ? (
        <FormSection
          step={step(reqStep)}
          title="Before You Sign Up"
          intro="Checked against your Commons account. Each one carries over to any other sign-up that asks for it."
          aside={
            <span className={`ff-survey__pill${outstanding.length ? "" : " ff-survey__pill--ok"}`}>
              {outstanding.length ? `${outstanding.length} to go` : "All set"}
            </span>
          }
        >
          <ul className="ff-survey__reqs">
            {checks.map((check) => (
              <li key={check.itemId} className="ff-survey__req">
                <RequirementMark met={check.met} />
                <div className="ff-survey__reqbody">
                  <p className="ff-survey__reqlabel">
                    {check.label}
                    {check.required ? null : <span className="ff-survey__tag">Optional</span>}
                  </p>
                  <p className="ff-survey__reqstatus">{check.status}</p>
                  {check.note ? <p className="ff-survey__reqnote">{check.note}</p> : null}
                </div>
                {check.met === true || !check.action ? null : (
                  <CheckAction
                    formId={formId}
                    action={check.action}
                    primary={check.itemId === nextId}
                  />
                )}
              </li>
            ))}
          </ul>
        </FormSection>
      ) : null}

      <form onSubmit={onSubmit}>
        {questions.length ? (
          <FormSection
            step={step(questionStep)}
            title="Questions"
            aside={
              requiredQuestions.length ? (
                <span className="ff-survey__key">
                  <span className="ff-survey__ast" aria-hidden="true">*</span> Required
                </span>
              ) : undefined
            }
          >
            <div className="ff-survey__questions">
              {questions.map((q) => (
                <QuestionField
                  key={q.id}
                  item={q}
                  value={answers[q.id] ?? null}
                  disabled={!accepting}
                  onChange={(v) => set(q.id, v)}
                />
              ))}
            </div>
          </FormSection>
        ) : null}

        <FormSection
          step={step(reviewStep)}
          title={signedUp ? "You're Signed Up" : "Review and Sign Up"}
        >
          {signedUp && response ? (
            <p className="ff-survey__banner ff-survey__banner--ok">
              Submitted {dateLabel(response.submittedAt)}
              {response.updatedAt !== response.submittedAt
                ? `, last updated ${dateLabel(response.updatedAt)}`
                : ""}
              .{accepting ? " You can update your answers until sign-ups close." : ""}
            </p>
          ) : response?.status === "withdrawn" ? (
            <p className="ff-survey__banner">
              You withdrew. Sign up again any time while it&rsquo;s open.
            </p>
          ) : null}

          <div className="ff-survey__panel">
            <p className="ff-survey__label">The organizer will see</p>
            <ul className="ff-survey__list">
              {shares.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          {error ? (
            <div className="ff-survey__banner ff-survey__banner--error" role="alert">
              <p>{error}</p>
              {blocking.length ? <p>Still needed: {blocking.join(", ")}.</p> : null}
            </div>
          ) : null}

          <div className="ff-survey__submit">
            {signedUp ? (
              <button
                className="ff-btn ff-btn--outline"
                type="button"
                disabled={pending}
                onClick={() => setWithdrawing(true)}
              >
                Withdraw
              </button>
            ) : null}
            <div className="ff-survey__submitmain">
              {saved ? (
                <span className="ff-survey__saved" role="status">
                  {signedUp ? "Saved." : "You're signed up."}
                </span>
              ) : accepting && blocked.length ? (
                <span className="ff-survey__hint">Finish the requirements above first.</span>
              ) : null}
              <button
                className="ff-btn ff-survey__next"
                type="submit"
                disabled={pending || !accepting || blocked.length > 0}
              >
                {pending ? "Saving…" : signedUp ? "Update Sign-Up" : "Sign Up"}
                {pending ? null : <ArrowRight />}
              </button>
            </div>
          </div>
        </FormSection>
      </form>

      <ConfirmDialog
        open={withdrawing}
        title="Withdraw Your Sign-Up?"
        description="The organizer will no longer see you on their list. You can sign up again while the form is open."
        confirmLabel="Withdraw"
        danger
        busy={pending}
        onConfirm={onWithdraw}
        onClose={() => setWithdrawing(false)}
      />
    </>
  );
}

/** The survey's progress bar, over the required items: met and answered. */
function Progress({ done, total }: { done: number; total: number }) {
  return (
    <div className="ff-survey__progress">
      <div
        className="ff-survey__progressbar"
        role="progressbar"
        aria-label="Required items done"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={`${done} of ${total}`}
      >
        <span
          className="ff-survey__progressfill"
          style={{ width: `${Math.round((done / total) * 100)}%` }}
        />
      </div>
      <span className="ff-survey__progresslabel">
        {done >= total ? "All required items done" : `${done} of ${total} required items done`}
      </span>
    </div>
  );
}

function CheckAction({
  formId,
  action,
  primary,
}: {
  formId: string;
  action: RequirementAction;
  primary: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const cls = `ff-btn ff-btn--sm${primary ? "" : " ff-btn--outline"}`;

  if (action.type === "link") {
    return (
      <div className="ff-survey__reqaction">
        {action.enabled ? (
          <LinkProviderButton
            provider={action.provider}
            label={action.label}
            callbackURL={formPath(formId)}
            small
            primary={primary}
          />
        ) : (
          <button className="ff-btn ff-btn--outline ff-btn--sm" type="button" disabled>
            Unavailable
          </button>
        )}
      </div>
    );
  }
  if (action.type === "href") {
    return (
      <div className="ff-survey__reqaction">
        <a
          className={cls}
          href={action.href}
          {...(action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {action.label}
        </a>
      </div>
    );
  }

  const run = () =>
    startTransition(async () => {
      setMessage(null);
      if (action.type === "verify_email") {
        const result = await authClient.sendVerificationEmail({
          email: action.email,
          callbackURL: formPath(formId),
        });
        setMessage(result.error ? (result.error.message ?? "Couldn't send.") : "Sent — check your inbox.");
        return;
      }
      if (action.type === "recheck_ow") {
        const result = await recheckOverwatch();
        if (!result.ok) setMessage(result.error);
      }
      router.refresh();
    });

  return (
    <div className="ff-survey__reqaction">
      <button className={cls} type="button" disabled={pending} onClick={run}>
        {pending
          ? "Checking…"
          : action.type === "verify_email"
            ? "Send Link"
            : "Check Again"}
      </button>
      {message ? (
        <span className="ff-survey__actionmsg" role="status">
          {message}
        </span>
      ) : null}
    </div>
  );
}

function QuestionField({
  item,
  value,
  disabled,
  onChange,
}: {
  item: FormItem;
  value: Answer;
  disabled: boolean;
  onChange: (value: Answer) => void;
}) {
  const id = `q-${item.id}`;
  const helpId = item.help ? `${id}-help` : undefined;
  const text = (
    <>
      {item.label ?? "Question"}
      {item.required ? (
        <span className="ff-survey__ast" aria-hidden="true">
          *
        </span>
      ) : null}
    </>
  );
  const help = item.help ? (
    <p id={helpId} className="ff-survey__help">
      {item.help}
    </p>
  ) : null;

  if (item.kind === "checkbox") {
    // One box to tick (a rules agreement): the statement is the choice itself.
    return (
      <div className="ff-survey__q">
        <label className="ff-survey__choice">
          <input
            className="ff-survey__control"
            type="checkbox"
            checked={value === true}
            disabled={disabled}
            required={item.required}
            aria-describedby={helpId}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="ff-survey__choicetext">{text}</span>
        </label>
        {help}
      </div>
    );
  }

  if (item.kind === "single_choice" || item.kind === "multi_choice") {
    // Every option visible as its own box, the way a survey lays out
    // multiple choice; radios for one answer, checkboxes for several.
    const multi = item.kind === "multi_choice";
    const picked = Array.isArray(value) ? value : [];
    return (
      <fieldset className="ff-survey__q" aria-describedby={helpId}>
        <legend className="ff-survey__qtext">{text}</legend>
        {help}
        <div className="ff-survey__choices">
          {choiceConfig(item.config).options.map((option) => (
            <label key={option} className="ff-survey__choice">
              {multi ? (
                <input
                  className="ff-survey__control"
                  type="checkbox"
                  checked={picked.includes(option)}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? [...picked, option]
                        : picked.filter((p) => p !== option),
                    )
                  }
                />
              ) : (
                <input
                  className="ff-survey__control"
                  type="radio"
                  name={id}
                  value={option}
                  checked={value === option}
                  disabled={disabled}
                  required={item.required}
                  onChange={() => onChange(option)}
                />
              )}
              <span className="ff-survey__choicetext">{option}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <div className="ff-survey__q">
      <label className="ff-survey__qtext" htmlFor={id}>
        {text}
      </label>
      {help}
      {item.kind === "long_text" ? (
        <textarea
          id={id}
          className="ff-survey__input ff-survey__input--long"
          value={typeof value === "string" ? value : ""}
          maxLength={LONG_ANSWER_MAX}
          disabled={disabled}
          required={item.required}
          aria-describedby={helpId}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          className="ff-survey__input"
          value={typeof value === "string" ? value : ""}
          maxLength={SHORT_ANSWER_MAX}
          disabled={disabled}
          required={item.required}
          aria-describedby={helpId}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
