"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createForm,
  deleteForm,
  setFormStatus,
} from "@/app/(dashboard)/forms/actions";
import { ConfirmDialog } from "@/components/dashboard/bubbles/ConfirmDialog";
import {
  FORM_STATUSES,
  FORM_STATUS_LABELS,
  type FormStatus,
} from "@/lib/signup-forms-shared";

/** Creates a draft and opens its builder. */
export function NewFormButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        className="ff-btn ff-btn--sm"
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await createForm();
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.push(`/forms/${result.id}/`);
          })
        }
      >
        {pending ? "Creating…" : "New Form"}
      </button>
      {error ? (
        <span className="ff-auth__error" role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}

/**
 * Draft / Open / Closed as a segmented control — a view-state shape, since the
 * status is the form's mode. Opening is refused server-side while a requirement
 * is misconfigured, and the reason shows here.
 */
export function FormStatusControl({
  formId,
  status,
}: {
  formId: string;
  status: FormStatus;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="ff-form-status">
      <div className="ff-segment" role="group" aria-label="Form status">
        {FORM_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className="ff-segment__btn"
            aria-pressed={status === s}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                // Revalidates: the response re-renders the builder.
                const result = await setFormStatus(formId, s);
                if (!result.ok) setError(result.error);
              })
            }
          >
            {FORM_STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      {error ? (
        <p className="ff-auth__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function DeleteFormButton({
  formId,
  title,
  responses,
}: {
  formId: string;
  title: string;
  responses: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setBusy(true);
    setError(null);
    const result = await deleteForm(formId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/forms/");
  }

  return (
    <>
      <button
        className="ff-btn ff-btn--outline ff-btn--sm"
        type="button"
        onClick={() => setOpen(true)}
      >
        Delete Form
      </button>
      <ConfirmDialog
        open={open}
        title="Delete This Form?"
        description={
          <>
            <strong>{title}</strong> and its{" "}
            {responses === 1 ? "1 sign-up" : `${responses} sign-ups`} will be
            deleted for good, and its link will stop working. Export first if you
            need the list.
          </>
        }
        confirmLabel="Delete"
        danger
        busy={busy}
        error={error}
        onConfirm={onConfirm}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
