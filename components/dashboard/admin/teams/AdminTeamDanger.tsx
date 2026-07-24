"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  adminDisbandTeam,
  adminRestoreTeam,
} from "@/app/admin/teams/actions";
import { ConfirmDialog } from "@/components/dashboard/bubbles/ConfirmDialog";

type Outcome = { ok: true } | { ok: false; error: string };

/**
 * Staff disband/restore. Disband is the direct override (no member vote); it
 * soft-deletes the team, and Restore brings it back with the roster it had at
 * disband time. Only rendered for `manageTeams` holders.
 */
export function AdminTeamDanger({
  teamId,
  teamName,
  disbanded,
}: {
  teamId: string;
  teamName: string;
  disbanded: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<Outcome>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  if (disbanded) {
    return (
      <>
        <p className="ff-row__note">
          This team is disbanded. Restoring makes it live again and brings back
          the roster it had when it was disbanded.
        </p>
        {error ? (
          <div className="ff-auth__error" role="alert">
            <p>{error}</p>
          </div>
        ) : null}
        <div className="ff-row__buttons">
          <button
            className="ff-btn ff-btn--sm"
            type="button"
            disabled={pending}
            onClick={() => run(() => adminRestoreTeam(teamId))}
          >
            {pending ? "Restoring…" : "Restore team"}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="ff-row__note">
        Disbanding hides the team and deactivates its roster. Standings and match
        history are kept, and it can be restored later.
      </p>
      {error && !confirming ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}
      <div className="ff-row__buttons">
        <button
          className="ff-btn ff-btn--danger ff-btn--sm"
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
        >
          Disband team
        </button>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Disband Team"
        description={`Disband ${teamName}? Its roster is deactivated and its invites revoked. You can restore it later.`}
        confirmLabel={pending ? "Disbanding…" : "Disband"}
        danger
        busy={pending}
        error={error}
        onConfirm={() => run(() => adminDisbandTeam(teamId))}
        onClose={() => {
          if (!pending) setConfirming(false);
        }}
      />
    </>
  );
}
