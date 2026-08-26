"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  cancelTeamDelete,
  leaveTeam,
  requestTeamDelete,
  voteTeamDelete,
} from "@/app/teams/actions";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { ConfirmDialog } from "@/components/dashboard/bubbles/ConfirmDialog";
import { can, type TeamRole } from "@/lib/teams-shared";

export type DeleteVoteView = {
  id: string;
  reason: string | null;
  requestedByName: string | null;
  votes: { userId: string; name: string; decision: string }[];
  pending: { userId: string; name: string }[];
};

/**
 * Leaving, and deleting. Deleting a team with several managers is a vote:
 * every current manager has to approve, and a single decline ends it. A sole
 * manager needs no vote — they already are unanimous.
 */
export function DangerZonePanel({
  teamId,
  teamName,
  viewerRole,
  viewerUserId,
  managerCount,
  deleteRequest,
}: {
  teamId: string;
  teamName: string;
  viewerRole: TeamRole;
  viewerUserId: string;
  managerCount: number;
  deleteRequest: DeleteVoteView | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<
    "leave" | "delete" | "approve" | null
  >(null);
  const [reason, setReason] = useState("");

  const mayDelete = can(viewerRole, "deleteTeam");
  const needsVote = managerCount > 1;
  const myVote = deleteRequest?.votes.find((v) => v.userId === viewerUserId);

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    after?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
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

      <BubbleRow
        label="Your spot"
        value={`Leave ${teamName}`}
        note="You keep your account; you'd need a new invite to come back."
        action={
          <button
            className="ff-btn ff-btn--outline ff-btn--sm"
            type="button"
            onClick={() => setConfirming("leave")}
          >
            Leave Team
          </button>
        }
      />

      {mayDelete && deleteRequest ? (
        <BubbleRow
          label="Deletion vote"
          value={`${deleteRequest.requestedByName ?? "A manager"} wants to delete this team`}
          note={
            deleteRequest.pending.length
              ? `Waiting on ${deleteRequest.pending.map((p) => p.name).join(", ")}. Every manager has to agree.`
              : "All managers have approved."
          }
          action={
            <div className="ff-row__buttons">
              {myVote?.decision === "approve" ? (
                <button
                  className="ff-btn ff-btn--outline ff-btn--sm"
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => cancelTeamDelete(deleteRequest.id))}
                >
                  Call It Off
                </button>
              ) : (
                <>
                  <button
                    className="ff-btn ff-btn--outline ff-btn--sm"
                    type="button"
                    disabled={pending}
                    onClick={() => setConfirming("approve")}
                  >
                    Approve
                  </button>
                  <button
                    className="ff-btn ff-btn--outline ff-btn--sm"
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() => voteTeamDelete(deleteRequest.id, "decline"))
                    }
                  >
                    Decline
                  </button>
                </>
              )}
            </div>
          }
        >
          {deleteRequest.reason ? (
            <p className="ff-row__note">
              Reason: {deleteRequest.reason}
            </p>
          ) : null}
        </BubbleRow>
      ) : null}

      {mayDelete && !deleteRequest ? (
        <BubbleRow
          label="Team"
          value={`Delete ${teamName}`}
          note={
            needsVote
              ? `This team has ${managerCount} managers — they all have to agree before it's deleted.`
              : "Removes the roster and invite links. Past results stay on record."
          }
          action={
            <button
              className="ff-btn ff-btn--outline ff-btn--sm"
              type="button"
              onClick={() => setConfirming("delete")}
            >
              {needsVote ? "Start Deletion Vote" : "Delete Team"}
            </button>
          }
        />
      ) : null}

      <ConfirmDialog
        open={confirming === "approve"}
        title="Approve Team Deletion"
        description={`Approve deleting ${teamName}? If yours is the final required vote, the team is deleted immediately.`}
        confirmLabel={pending ? "Approving…" : "Approve deletion"}
        danger
        busy={pending}
        error={error}
        onConfirm={() => {
          if (!deleteRequest) return;
          run(
            () => voteTeamDelete(deleteRequest.id, "approve"),
            () => setConfirming(null),
          );
        }}
        onClose={() => {
          if (!pending) setConfirming(null);
        }}
      />

      <ConfirmDialog
        open={confirming === "leave"}
        title="Leave This Team"
        description={`You'll drop off ${teamName}'s roster. If you're its only manager, promote someone first.`}
        confirmLabel="Leave Team"
        danger
        busy={pending}
        error={error}
        onConfirm={() =>
          run(
            () => leaveTeam(teamId),
            () => {
              setConfirming(null);
              router.push("/teams/");
            },
          )
        }
        onClose={() => {
          if (!pending) setConfirming(null);
        }}
      />

      <ConfirmDialog
        open={confirming === "delete"}
        title={needsVote ? "Start a Deletion Vote" : "Delete This Team"}
        description={
          needsVote
            ? `Every manager of ${teamName} has to approve before it's deleted. One decline calls it off.`
            : `${teamName}'s roster and invite links go away. Tournament results stay on record.`
        }
        confirmLabel={needsVote ? "Start Vote" : "Delete Team"}
        danger
        busy={pending}
        error={error}
        onConfirm={() =>
          run(
            async () => {
              const result = await requestTeamDelete(teamId, reason);
              if (result.ok && result.disbanded) router.push("/teams/");
              return result;
            },
            () => setConfirming(null),
          )
        }
        onClose={() => {
          if (!pending) setConfirming(null);
        }}
      >
        <label className="ff-auth__field">
          <span className="ff-auth__label">Reason (optional)</span>
          <input
            className="ff-auth__input"
            type="text"
            value={reason}
            maxLength={300}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
      </ConfirmDialog>
    </>
  );
}
