"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import {
  addQuestion,
  importQuestions,
  moveQuestion,
  removeQuestion,
  updateQuestion,
  type QuestionInput,
} from "@/app/(dashboard)/forms/actions";
import { ConfirmDialog } from "@/components/dashboard/bubbles/ConfirmDialog";
import { Switch } from "@/components/dashboard/bubbles/Switch";
import {
  HELP_MAX,
  LABEL_MAX,
  MAX_OPTIONS,
  MAX_QUESTIONS,
  OPTION_MAX,
  QUESTION_KINDS,
  QUESTION_LABELS,
  choiceConfig,
  isChoiceKind,
  type FormItem,
} from "@/lib/signup-forms-shared";

/** What "Add question" creates — Google Forms' own default. */
const NEW_QUESTION: QuestionInput = {
  kind: "single_choice",
  label: "Untitled question",
  help: "",
  required: false,
  options: "Option 1",
};

/** How long typing has to pause before a card saves itself. */
const AUTOSAVE_MS = 700;

type Draft = {
  kind: string;
  label: string;
  help: string;
  required: boolean;
  options: { key: number; text: string }[];
};

function toInput(d: Draft): QuestionInput {
  return {
    kind: d.kind,
    label: d.label,
    help: d.help,
    required: d.required,
    options: d.options.map((o) => o.text.trim()).filter(Boolean).join("\n"),
  };
}

/** The same rules the server applies, checked before a save is sent. */
function draftProblem(d: Draft): string | null {
  if (!d.label.trim()) return "Write the question.";
  if (isChoiceKind(d.kind) && !d.options.some((o) => o.text.trim())) {
    return "Add at least one option.";
  }
  return null;
}

/**
 * The organizer's questions, edited the way Google Forms edits them: every
 * question is a card showing what players will see; clicking one opens it in
 * place — title, answer type, description, the options themselves — with a
 * footer of Move / Duplicate / Delete and the Required switch. An open card
 * saves itself a moment after typing stops, and again when it closes
 * (clicking another card or anywhere outside the list), so there is no Save
 * button to forget.
 *
 * Structural changes (add, duplicate, move, delete, import) go to the server
 * and refresh; an autosave patches the local list instead, so typing never
 * waits on a page refresh. Beside the column sits Forms' floating toolbar:
 * add, duplicate the open card, import another form's questions.
 */
export function QuestionsEditor({
  formId,
  questions,
  lead,
  importSources,
}: {
  formId: string;
  questions: FormItem[];
  /** Cards above the questions in the same column — the title card and the
      verification summary — so the toolbar sits beside the whole form. */
  lead?: ReactNode;
  /** The organizer's other forms with questions, for the toolbar's Import. */
  importSources: { id: string; title: string; questions: number }[];
}) {
  const [list, setList] = useState(questions);
  useEffect(() => setList(questions), [questions]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<FormItem | null>(null);
  const [importing, setImporting] = useState(false);
  const [importFrom, setImportFrom] = useState(importSources[0]?.id ?? "");
  const listRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  // The open card's live draft, so the toolbar's Duplicate copies what's on
  // screen rather than the last autosave.
  const activeDraft = useRef<Draft | null>(null);

  // A click outside the questions and the toolbar closes the open card; its
  // draft saves on close.
  useEffect(() => {
    if (!activeId) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (listRef.current?.contains(target) || toolbarRef.current?.contains(target)) return;
      setActiveId(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [activeId]);

  function structural(
    task: () => Promise<{ ok: true; id?: string } | { ok: false; error: string }>,
    after?: (id?: string) => void,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The action's response is the re-rendered page (it revalidates), which
      // re-seeds `list` through the effect above.
      after?.(result.id);
    });
  }

  function add(input: QuestionInput, afterId?: string) {
    structural(
      () => addQuestion(formId, input, afterId),
      (id) => {
        if (!id) return;
        setActiveId(id);
        setFreshId(id);
      },
    );
  }

  const active = list.find((q) => q.id === activeId) ?? null;

  return (
    <div className="ff-fbcanvas">
      <div className="ff-fbcanvas__col">
        {lead}
        <div className="ff-gq-list" ref={listRef}>
          {error ? (
            <div className="ff-auth__error" role="alert">
              <p>{error}</p>
            </div>
          ) : null}

          {list.map((q, index) =>
            q.id === activeId ? (
              <ActiveQuestion
                key={q.id}
                formId={formId}
                item={q}
                first={index === 0}
                last={index === list.length - 1}
                busy={pending}
                autoFocus={q.id === freshId}
                draftSink={activeDraft}
                onSaved={(next) =>
                  setList((prev) => prev.map((x) => (x.id === next.id ? next : x)))
                }
                onMove={(direction) => structural(() => moveQuestion(formId, q.id, direction))}
                onDuplicate={(draft) => add(toInput(draft), q.id)}
                onDelete={() => setDeleting(q)}
              />
            ) : (
              <QuestionPreview key={q.id} item={q} onOpen={() => setActiveId(q.id)} />
            ),
          )}

          <button
            type="button"
            className="ff-gq-addcard"
            disabled={pending || list.length >= MAX_QUESTIONS}
            onClick={() => add(NEW_QUESTION, activeId ?? undefined)}
          >
            + Add question
          </button>

          {/* Inside the list, so clicking in the dialog doesn't count as "outside". */}
          <ConfirmDialog
            open={deleting !== null}
            title="Delete This Question?"
            description="Every answer already given to it is deleted too."
            confirmLabel="Delete"
            danger
            busy={pending}
            onConfirm={() => {
              const target = deleting;
              setDeleting(null);
              if (!target) return;
              structural(
                () => removeQuestion(formId, target.id),
                () => setActiveId(null),
              );
            }}
            onClose={() => setDeleting(null)}
          />
          <ConfirmDialog
            open={importing}
            title="Import Questions"
            description="Copies every question from one of your other forms onto the end of this one."
            confirmLabel="Import"
            busy={pending}
            onConfirm={() => {
              if (!importFrom) return;
              setImporting(false);
              structural(() => importQuestions(formId, importFrom));
            }}
            onClose={() => setImporting(false)}
          >
            <label className="ff-auth__field">
              <span className="ff-auth__label">From</span>
              <select
                className="ff-auth__input"
                value={importFrom}
                onChange={(e) => setImportFrom(e.target.value)}
              >
                {importSources.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title} ({f.questions === 1 ? "1 question" : `${f.questions} questions`})
                  </option>
                ))}
              </select>
            </label>
          </ConfirmDialog>
        </div>
      </div>

      {/* Forms' floating toolbar: add, duplicate the open card, import. Sticky,
          so it stays beside whatever the organizer is working on. */}
      <div className="ff-fbtools" ref={toolbarRef} role="toolbar" aria-label="Question tools">
        <button
          type="button"
          className="ff-gq__icon"
          aria-label="Add question"
          title="Add question"
          disabled={pending || list.length >= MAX_QUESTIONS}
          onClick={() => add(NEW_QUESTION, activeId ?? undefined)}
        >
          <PlusIcon />
        </button>
        <button
          type="button"
          className="ff-gq__icon"
          aria-label="Duplicate the open question"
          title={active ? "Duplicate question" : "Open a question to duplicate it"}
          disabled={pending || !active || list.length >= MAX_QUESTIONS}
          onClick={() => {
            const draft = activeDraft.current;
            if (active && draft && !draftProblem(draft)) add(toInput(draft), active.id);
          }}
        >
          <CopyIcon />
        </button>
        <button
          type="button"
          className="ff-gq__icon"
          aria-label="Import questions from another form"
          title={importSources.length ? "Import questions" : "No other forms with questions"}
          disabled={pending || !importSources.length}
          onClick={() => setImporting(true)}
        >
          <ImportIcon />
        </button>
      </div>
    </div>
  );
}

/** A closed card: exactly what a player will see, one click from editing. */
function QuestionPreview({ item, onOpen }: { item: FormItem; onOpen: () => void }) {
  return (
    <div
      className="ff-gq"
      role="button"
      tabIndex={0}
      aria-label={`Edit question: ${item.label ?? "Untitled"}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="ff-gq__title">
        {item.label}
        {item.required ? (
          <span className="ff-gq__req" aria-label="required">
            *
          </span>
        ) : null}
      </div>
      {item.help ? <div className="ff-gq__help">{item.help}</div> : null}
      <AnswerPreview kind={item.kind} options={choiceConfig(item.config).options} />
    </div>
  );
}

function AnswerPreview({ kind, options }: { kind: string; options: string[] }) {
  if (kind === "short_text") return <div className="ff-gq__line">Short answer text</div>;
  if (kind === "long_text") return <div className="ff-gq__line ff-gq__line--long">Long answer text</div>;
  if (kind === "checkbox") {
    return (
      <div className="ff-gq__option">
        <span className="ff-gq__glyph ff-gq__glyph--box" aria-hidden="true" />
        <span className="ff-gq__dim">Players tick this box</span>
      </div>
    );
  }
  const box = kind === "multi_choice";
  return (
    <ul className="ff-gq__options">
      {options.map((option) => (
        <li key={option} className="ff-gq__option">
          <span className={`ff-gq__glyph${box ? " ff-gq__glyph--box" : ""}`} aria-hidden="true" />
          <span>{option}</span>
        </li>
      ))}
    </ul>
  );
}

/** The open card. Owns its draft; saves itself on a pause and on close. */
function ActiveQuestion({
  formId,
  item,
  first,
  last,
  busy,
  autoFocus,
  draftSink,
  onSaved,
  onMove,
  onDuplicate,
  onDelete,
}: {
  formId: string;
  item: FormItem;
  first: boolean;
  last: boolean;
  busy: boolean;
  autoFocus: boolean;
  draftSink: { current: Draft | null };
  onSaved: (next: FormItem) => void;
  onMove: (direction: "up" | "down") => void;
  onDuplicate: (draft: Draft) => void;
  onDelete: () => void;
}) {
  const nextKey = useRef(0);
  const keyed = (texts: string[]) => texts.map((text) => ({ key: nextKey.current++, text }));

  const [draft, setDraft] = useState<Draft>(() => ({
    kind: item.kind,
    label: item.label ?? "",
    help: item.help ?? "",
    required: item.required,
    options: keyed(isChoiceKind(item.kind) ? choiceConfig(item.config).options : []),
  }));
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<number | null>(null);

  // The latest draft and whether it still needs saving, readable from the
  // debounce timer and the on-close flush without stale closures.
  const latest = useRef(draft);
  latest.current = draft;
  // Publish the live draft for the toolbar's Duplicate. In an effect, paired
  // with its own cleanup, so a dev StrictMode remount (cleanup without a
  // re-render) can't leave the sink empty.
  useEffect(() => {
    draftSink.current = draft;
    return () => {
      draftSink.current = null;
    };
  });
  // Forms keeps the description out of the way until it's wanted.
  const [showHelp, setShowHelp] = useState(Boolean(item.help));
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef(new Map<number, HTMLInputElement>());

  async function save() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    const d = latest.current;
    const local = draftProblem(d);
    if (local) {
      setProblem(local);
      return;
    }
    dirty.current = false;
    setStatus("saving");
    const result = await updateQuestion(formId, item.id, toInput(d));
    if (!result.ok) {
      dirty.current = true;
      setProblem(result.error);
      setStatus("idle");
      return;
    }
    setProblem(null);
    setStatus("saved");
    const options = d.options.map((o) => o.text.trim()).filter(Boolean);
    onSaved({
      ...item,
      kind: d.kind,
      label: d.label.trim(),
      help: d.help.trim() || null,
      required: d.required,
      config: isChoiceKind(d.kind) ? { options } : {},
    });
  }

  function change(patch: Partial<Draft>) {
    dirty.current = true;
    setStatus("idle");
    setProblem(null);
    setDraft((prev) => ({ ...prev, ...patch }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS);
  }

  // Closing the card (it unmounts) flushes whatever hasn't saved yet.
  useEffect(
    () => () => {
      if (dirty.current) void save();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (!autoFocus) return;
    titleRef.current?.focus();
    titleRef.current?.select();
  }, [autoFocus]);

  useEffect(() => {
    if (focusKey == null) return;
    const input = optionRefs.current.get(focusKey);
    input?.focus();
    input?.select();
    setFocusKey(null);
  }, [focusKey]);

  function setKind(kind: string) {
    const options =
      isChoiceKind(kind) && !draft.options.some((o) => o.text.trim())
        ? keyed(["Option 1"])
        : draft.options;
    change({ kind, options });
  }

  function insertOption(at: number) {
    if (draft.options.length >= MAX_OPTIONS) return;
    const option = { key: nextKey.current++, text: `Option ${draft.options.length + 1}` };
    change({ options: [...draft.options.slice(0, at), option, ...draft.options.slice(at)] });
    setFocusKey(option.key);
  }

  function removeOption(index: number, focusPrevious = false) {
    const options = draft.options.filter((_, i) => i !== index);
    change({ options });
    if (focusPrevious && options[index - 1]) setFocusKey(options[index - 1].key);
  }

  const choice = isChoiceKind(draft.kind);
  const box = draft.kind === "multi_choice";

  return (
    <div className="ff-gq ff-gq--active">
      <div className="ff-gq__head">
        <input
          ref={titleRef}
          className="ff-gq__input ff-gq__input--title"
          value={draft.label}
          maxLength={LABEL_MAX}
          placeholder="Question"
          aria-label="Question"
          onChange={(e) => change({ label: e.target.value })}
        />
        <select
          className="ff-auth__input ff-gq__type"
          value={draft.kind}
          aria-label="Answer type"
          onChange={(e) => setKind(e.target.value)}
        >
          {QUESTION_KINDS.map((k) => (
            <option key={k} value={k}>
              {QUESTION_LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      {showHelp ? (
        <input
          className="ff-gq__input ff-gq__input--help"
          value={draft.help}
          maxLength={HELP_MAX}
          placeholder="Description"
          aria-label="Description"
          autoFocus={!item.help}
          onChange={(e) => change({ help: e.target.value })}
        />
      ) : null}

      {choice ? (
        <ul className="ff-gq__options">
          {draft.options.map((option, index) => (
            <li key={option.key} className="ff-gq__option">
              <span className={`ff-gq__glyph${box ? " ff-gq__glyph--box" : ""}`} aria-hidden="true" />
              <input
                ref={(el) => {
                  if (el) optionRefs.current.set(option.key, el);
                  else optionRefs.current.delete(option.key);
                }}
                className="ff-gq__optinput"
                value={option.text}
                maxLength={OPTION_MAX}
                aria-label={`Option ${index + 1}`}
                onChange={(e) =>
                  change({
                    options: draft.options.map((o) =>
                      o.key === option.key ? { ...o, text: e.target.value } : o,
                    ),
                  })
                }
                onKeyDown={(e) => {
                  // Google Forms' keys: Enter adds the next option, Backspace
                  // in an empty one removes it.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    insertOption(index + 1);
                  } else if (e.key === "Backspace" && !option.text && draft.options.length > 1) {
                    e.preventDefault();
                    removeOption(index, true);
                  }
                }}
              />
              {draft.options.length > 1 ? (
                <button
                  type="button"
                  className="ff-gq__icon"
                  aria-label={`Remove option ${index + 1}`}
                  onClick={() => removeOption(index)}
                >
                  <CloseIcon />
                </button>
              ) : null}
            </li>
          ))}
          {draft.options.length < MAX_OPTIONS ? (
            <li className="ff-gq__option">
              <span
                className={`ff-gq__glyph ff-gq__glyph--add${box ? " ff-gq__glyph--box" : ""}`}
                aria-hidden="true"
              />
              <button
                type="button"
                className="ff-gq__add"
                onClick={() => insertOption(draft.options.length)}
              >
                Add option
              </button>
            </li>
          ) : null}
        </ul>
      ) : (
        <AnswerPreview kind={draft.kind} options={[]} />
      )}

      <div className="ff-gq__foot">
        {!showHelp ? (
          <button type="button" className="ff-gq__add ff-gq__foot-add" onClick={() => setShowHelp(true)}>
            + Description
          </button>
        ) : null}
        <span className={`ff-gq__status${problem ? " ff-gq__status--error" : ""}`} role="status">
          {problem ?? (status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "")}
        </span>
        <button
          type="button"
          className="ff-gq__icon"
          aria-label="Move question up"
          title="Move up"
          disabled={busy || first}
          onClick={() => onMove("up")}
        >
          <ArrowIcon up />
        </button>
        <button
          type="button"
          className="ff-gq__icon"
          aria-label="Move question down"
          title="Move down"
          disabled={busy || last}
          onClick={() => onMove("down")}
        >
          <ArrowIcon />
        </button>
        <button
          type="button"
          className="ff-gq__icon"
          aria-label="Duplicate question"
          title="Duplicate"
          disabled={busy || Boolean(draftProblem(draft))}
          onClick={() => onDuplicate(draft)}
        >
          <CopyIcon />
        </button>
        <button
          type="button"
          className="ff-gq__icon"
          aria-label="Delete question"
          title="Delete"
          disabled={busy}
          onClick={onDelete}
        >
          <TrashIcon />
        </button>
        <span className="ff-gq__divider" aria-hidden="true" />
        <span className="ff-gq__required">
          Required
          <Switch
            checked={draft.required}
            onChange={(required) => change({ required })}
            label="Required"
          />
        </span>
      </div>
    </div>
  );
}

function ArrowIcon({ up }: { up?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d={up ? "M8 13V3M4 7l4-4 4 4" : "M8 3v10M4 9l4 4 4-4"} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 3.5V3a1.5 1.5 0 0 0-1.5-1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h.5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.3a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L12 4M6.75 6.5v5M9.25 6.5v5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M8 3v10M3 8h10" strokeLinecap="round" />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M8 10V2.5M5 5.5l3-3 3 3M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
