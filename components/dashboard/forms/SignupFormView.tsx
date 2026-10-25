"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  recheckOverwatch,
  submitSignup,
  withdrawSignup,
} from "@/app/f/[id]/actions";
import { LinkProviderButton } from "@/components/dashboard/LinkProviderButton";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { ConfirmDialog } from "@/components/dashboard/bubbles/ConfirmDialog";
import { authClient } from "@/lib/auth-client";
import {
  LONG_ANSWER_MAX,
  SHORT_ANSWER_MAX,
  choiceConfig,
  formPath,
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

/**
 * A member filling in a sign-up form: what the organizer requires (each row
 * saying where they stand and the one click that fixes it), the organizer's
 * questions, and exactly what will be shared before they press Sign Up.
 * Requirement state comes from the server's cached checks; the submit re-checks
 * everything live, so this page's checkmarks are guidance, not the gate.
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
      {checks.length ? (
        <Bubble
          title="Requirements"
          span="full"
          actions={
            <span className="ff-badge">
              {outstanding.length ? `${outstanding.length} to go` : "All set"}
            </span>
          }
        >
          {checks.map((check) => (
            <BubbleRow
              key={check.itemId}
              label={check.required ? check.label : `${check.label} (optional)`}
              value={
                <span className={check.met === true ? "ff-form-met" : undefined}>
                  {check.met === true ? "✓ " : ""}
                  {check.status}
                </span>
              }
              note={check.note}
              action={
                check.met === true || !check.action ? undefined : (
                  <CheckAction
                    formId={formId}
                    action={check.action}
                    primary={check.itemId === nextId}
                  />
                )
              }
            />
          ))}
        </Bubble>
      ) : null}

      {/* display: contents — the form groups the two bubbles for submit without
          becoming a grid item of its own. */}
      <form className="ff-form-fill" onSubmit={onSubmit}>
        {questions.length ? (
          <Bubble title="Your Answers" span="full">
            {questions.map((q) => (
              <QuestionField
                key={q.id}
                item={q}
                value={answers[q.id] ?? null}
                disabled={!accepting}
                onChange={(v) => set(q.id, v)}
              />
            ))}
          </Bubble>
        ) : null}

        <Bubble
          title={signedUp ? "You're Signed Up" : "Sign Up"}
          span="full"
          actions={signedUp ? <span className="ff-badge">Submitted</span> : undefined}
        >
          {signedUp && response ? (
            <p className="ff-auth__hint">
              Submitted {dateLabel(response.submittedAt)}
              {response.updatedAt !== response.submittedAt
                ? `, last updated ${dateLabel(response.updatedAt)}`
                : ""}
              .{accepting ? " You can update your answers until sign-ups close." : ""}
            </p>
          ) : response?.status === "withdrawn" ? (
            <p className="ff-auth__hint">You withdrew. Sign up again any time while it&rsquo;s open.</p>
          ) : null}

          <p className="ff-form-shares__title">The organizer will see:</p>
          <ul className="ff-form-shares">
            {shares.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>

          {error ? (
            <div className="ff-auth__error" role="alert">
              <p>{error}</p>
              {blocking.length ? <p>Still needed: {blocking.join(", ")}.</p> : null}
            </div>
          ) : null}
          {saved ? (
            <p className="ff-row__saved" role="status">
              {signedUp ? "Saved." : "You're signed up."}
            </p>
          ) : null}

          <div className="ff-row__buttons">
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
            <button
              className="ff-btn"
              type="submit"
              disabled={pending || !accepting || blocked.length > 0}
              title={blocked.length ? "Finish the requirements above first" : undefined}
            >
              {pending ? "Saving…" : signedUp ? "Update Sign-Up" : "Sign Up"}
            </button>
          </div>
        </Bubble>
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
    return action.enabled ? (
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
    );
  }
  if (action.type === "href") {
    return (
      <a
        className={cls}
        href={action.href}
        {...(action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {action.label}
      </a>
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
    <div className="ff-form-action">
      <button className={cls} type="button" disabled={pending} onClick={run}>
        {pending
          ? "Checking…"
          : action.type === "verify_email"
            ? "Send Link"
            : "Check Again"}
      </button>
      {message ? (
        <span className="ff-row__hint" role="status">
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
  const label = `${item.label ?? "Question"}${item.required ? "" : " (optional)"}`;
  const help = item.help ? <span className="ff-row__hint">{item.help}</span> : null;

  if (item.kind === "checkbox") {
    return (
      <div className="ff-auth__field">
        <label className="ff-form-check">
          <input
            type="checkbox"
            checked={value === true}
            disabled={disabled}
            required={item.required}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>{label}</span>
        </label>
        {help}
      </div>
    );
  }

  if (item.kind === "single_choice") {
    // Radios, as Google Forms shows "Multiple choice" — every option visible.
    return (
      <fieldset className="ff-auth__field ff-form-choices">
        <legend className="ff-auth__label">{label}</legend>
        {help}
        {choiceConfig(item.config).options.map((option) => (
          <label key={option} className="ff-form-check">
            <input
              type="radio"
              name={id}
              value={option}
              checked={value === option}
              disabled={disabled}
              required={item.required}
              onChange={() => onChange(option)}
            />
            <span>{option}</span>
          </label>
        ))}
      </fieldset>
    );
  }

  if (item.kind === "multi_choice") {
    const picked = Array.isArray(value) ? value : [];
    return (
      <fieldset className="ff-auth__field ff-form-choices">
        <legend className="ff-auth__label">{label}</legend>
        {help}
        {choiceConfig(item.config).options.map((option) => (
          <label key={option} className="ff-form-check">
            <input
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
            <span>{option}</span>
          </label>
        ))}
      </fieldset>
    );
  }

  return (
    <label className="ff-auth__field" htmlFor={id}>
      <span className="ff-auth__label">{label}</span>
      {item.kind === "long_text" ? (
        <textarea
          id={id}
          className="ff-auth__input ff-reg__textarea"
          value={typeof value === "string" ? value : ""}
          maxLength={LONG_ANSWER_MAX}
          disabled={disabled}
          required={item.required}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          className="ff-auth__input"
          value={typeof value === "string" ? value : ""}
          maxLength={SHORT_ANSWER_MAX}
          disabled={disabled}
          required={item.required}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {help}
    </label>
  );
}
