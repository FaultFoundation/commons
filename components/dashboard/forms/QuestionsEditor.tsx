"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  addQuestion,
  moveQuestion,
  removeQuestion,
  updateQuestion,
  type QuestionInput,
} from "@/app/(dashboard)/forms/actions";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { ConfirmDialog } from "@/components/dashboard/bubbles/ConfirmDialog";
import { Switch } from "@/components/dashboard/bubbles/Switch";
import {
  HELP_MAX,
  LABEL_MAX,
  MAX_QUESTIONS,
  QUESTION_KINDS,
  QUESTION_LABELS,
  choiceConfig,
  isChoiceKind,
  type FormItem,
} from "@/lib/signup-forms-shared";

/**
 * The organizer's own questions, in the order players see them. Each row opens
 * in place to edit; the arrows reorder; a blank form at the foot adds one.
 * Removing a question removes its answers too, and the note says so.
 */
export function QuestionsEditor({
  formId,
  questions,
}: {
  formId: string;
  questions: FormItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  function run(task: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      after?.();
      router.refresh();
    });
  }

  return (
    <>
      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}
      {!questions.length ? (
        <p className="ff-auth__hint">
          No questions yet. Ask for anything the requirements don&rsquo;t cover: team name,
          preferred role, availability, a rules agreement.
        </p>
      ) : null}
      {questions.map((q, index) => {
        const choices = isChoiceKind(q.kind) ? choiceConfig(q.config).options : [];
        return (
          <BubbleRow
            key={q.id}
            label={q.label ?? "Question"}
            value={`${QUESTION_LABELS[q.kind as keyof typeof QUESTION_LABELS] ?? q.kind} · ${q.required ? "Required" : "Optional"}`}
            note={choices.length ? choices.join(" · ") : (q.help ?? undefined)}
            action={
              <div className="ff-row__buttons">
                <button
                  className="ff-btn ff-btn--outline ff-btn--sm"
                  type="button"
                  aria-label={`Move ${q.label} up`}
                  disabled={pending || index === 0}
                  onClick={() => run(() => moveQuestion(formId, q.id, "up"))}
                >
                  ↑
                </button>
                <button
                  className="ff-btn ff-btn--outline ff-btn--sm"
                  type="button"
                  aria-label={`Move ${q.label} down`}
                  disabled={pending || index === questions.length - 1}
                  onClick={() => run(() => moveQuestion(formId, q.id, "down"))}
                >
                  ↓
                </button>
                <button
                  className="ff-btn ff-btn--outline ff-btn--sm"
                  type="button"
                  aria-expanded={editing === q.id}
                  onClick={() => setEditing(editing === q.id ? null : q.id)}
                >
                  {editing === q.id ? "Close" : "Edit"}
                </button>
              </div>
            }
          >
            {editing === q.id ? (
              <QuestionForm
                initial={{
                  kind: q.kind,
                  label: q.label ?? "",
                  help: q.help ?? "",
                  required: q.required,
                  options: choices.join("\n"),
                }}
                pending={pending}
                submitLabel="Save Question"
                onSubmit={(input) => run(() => updateQuestion(formId, q.id, input), () => setEditing(null))}
                onRemove={() => run(() => removeQuestion(formId, q.id), () => setEditing(null))}
              />
            ) : undefined}
          </BubbleRow>
        );
      })}

      {adding ? (
        <div className="ff-form-add">
          <QuestionForm
            initial={{ kind: "short_text", label: "", help: "", required: true, options: "" }}
            pending={pending}
            submitLabel="Add Question"
            onSubmit={(input) => run(() => addQuestion(formId, input), () => setAdding(false))}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <div className="ff-row__buttons">
          <button
            className="ff-btn ff-btn--outline ff-btn--sm"
            type="button"
            disabled={questions.length >= MAX_QUESTIONS}
            onClick={() => setAdding(true)}
          >
            Add a Question
          </button>
        </div>
      )}
    </>
  );
}

function QuestionForm({
  initial,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
  onRemove,
}: {
  initial: QuestionInput;
  pending: boolean;
  submitLabel: string;
  onSubmit: (input: QuestionInput) => void;
  onCancel?: () => void;
  onRemove?: () => void;
}) {
  const [kind, setKind] = useState(initial.kind);
  const [label, setLabel] = useState(initial.label);
  const [help, setHelp] = useState(initial.help);
  const [required, setRequired] = useState(initial.required);
  const [options, setOptions] = useState(initial.options);
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <form
        className="ff-form-editor"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ kind, label, help, required, options });
        }}
      >
        <div className="ff-form-editor__pair">
          <label className="ff-auth__field">
            <span className="ff-auth__label">Question</span>
            <input
              className="ff-auth__input"
              value={label}
              maxLength={LABEL_MAX}
              required
              placeholder="Team name"
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <label className="ff-auth__field">
            <span className="ff-auth__label">Answer type</span>
            <select className="ff-auth__input" value={kind} onChange={(e) => setKind(e.target.value)}>
              {QUESTION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {QUESTION_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {isChoiceKind(kind) ? (
          <label className="ff-auth__field">
            <span className="ff-auth__label">Choices, one per line</span>
            <textarea
              className="ff-auth__input ff-reg__textarea"
              value={options}
              placeholder={"Tank\nDamage\nSupport"}
              onChange={(e) => setOptions(e.target.value)}
            />
          </label>
        ) : null}
        <label className="ff-auth__field">
          <span className="ff-auth__label">Help text (optional)</span>
          <input
            className="ff-auth__input"
            value={help}
            maxLength={HELP_MAX}
            onChange={(e) => setHelp(e.target.value)}
          />
        </label>
        <BubbleRow
          label="Required"
          note={kind === "checkbox" ? "Players must tick it — use this for a rules agreement." : undefined}
          action={<Switch checked={required} onChange={setRequired} label="Required" />}
        />
        <div className="ff-row__buttons">
          {onRemove ? (
            <button
              className="ff-btn ff-btn--outline ff-btn--sm"
              type="button"
              disabled={pending}
              onClick={() => setConfirming(true)}
            >
              Remove
            </button>
          ) : null}
          {onCancel ? (
            <button className="ff-btn ff-btn--outline ff-btn--sm" type="button" onClick={onCancel}>
              Cancel
            </button>
          ) : null}
          <button className="ff-btn ff-btn--sm" type="submit" disabled={pending || !label.trim()}>
            {submitLabel}
          </button>
        </div>
      </form>
      {/* Outside the <form>: the dialog carries a form of its own. */}
      {onRemove ? (
        <ConfirmDialog
          open={confirming}
          title="Remove This Question?"
          description="Every answer already given to it is removed too."
          confirmLabel="Remove"
          danger
          busy={pending}
          onConfirm={() => {
            setConfirming(false);
            onRemove();
          }}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </>
  );
}
