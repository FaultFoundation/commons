"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteTournament, resetBracket } from "@/app/admin/tournaments/actions";
import { ConfirmDialog } from "@/components/dashboard/bubbles/ConfirmDialog";

/**
 * Destructive controls. Reset drops a started bracket back to seeding
 * (change_state "reset" on Challonge), discarding every reported result. Delete
 * removes the tournament here and on Challonge. Both are two-step, because both
 * are unrecoverable.
 */
export function TournamentDanger({
  tournamentId,
  name,
  canReset,
}: {
  tournamentId: string;
  name: string;
  canReset: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<"reset" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function runReset() {
    setError(null);
    startTransition(async () => {
      const result = await resetBracket(tournamentId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirming(null);
      router.refresh();
    });
  }

  function runDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteTournament(tournamentId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirming(null);
      router.push("/admin/tournaments/");
    });
  }

  return (
    <>
      <p className="ff-row__note">
        Resetting returns the tournament to seeding and discards every reported
        result on Challonge. Deleting removes it here and on Challonge for good.
      </p>

      {error && !confirming ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      <div className="ff-row__buttons">
        {canReset ? (
          <button
            className="ff-btn ff-btn--danger ff-btn--sm"
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              setConfirming("reset");
            }}
          >
            Reset bracket
          </button>
        ) : null}
        <button
          className="ff-btn ff-btn--danger ff-btn--sm"
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            setConfirming("delete");
          }}
        >
          Delete tournament
        </button>
      </div>

      <ConfirmDialog
        open={confirming === "reset"}
        title="Reset Bracket"
        description="Discard the started bracket and every reported result, returning to seeding? This can't be undone."
        confirmLabel={pending ? "Resetting…" : "Reset bracket"}
        danger
        busy={pending}
        error={error}
        onConfirm={runReset}
        onClose={() => {
          if (!pending) setConfirming(null);
        }}
      />

      <ConfirmDialog
        open={confirming === "delete"}
        title="Delete Tournament"
        description={`Permanently delete "${name}" here and on Challonge? This can't be undone.`}
        confirmLabel={pending ? "Deleting…" : "Delete tournament"}
        danger
        busy={pending}
        error={error}
        onConfirm={runDelete}
        onClose={() => {
          if (!pending) setConfirming(null);
        }}
      />
    </>
  );
}
