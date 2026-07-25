"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { markIneligible, markVerified } from "@/app/admin/verification/actions";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { ConfirmDialog } from "@/components/dashboard/bubbles/ConfirmDialog";

type ReviewMember = {
  userId: string;
  membershipId: string;
  name: string;
  email: string;
  userType: string | null;
  ageRange: string | null;
  schoolName: string | null;
  schoolEmail: string | null;
  graduationDate: string | null;
  referrer: string | null;
  circumstances: string | null;
  createdAt: number;
};

type Outcome = { ok: true } | { ok: false; error: string };

/**
 * The verification queue: each pending registration with Verify / Mark
 * ineligible. Deciding is off-platform judgment — there are no documents here.
 */
export function VerificationPanel({ members }: { members: ReviewMember[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [denying, setDenying] = useState<ReviewMember | null>(null);

  function run(action: () => Promise<Outcome>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDenying(null);
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

      {members.map((member) => {
        const meta = [
          member.userType,
          member.schoolName,
          member.schoolEmail,
          member.graduationDate ? `grad ${member.graduationDate}` : null,
          member.ageRange,
          member.referrer ? `ref: ${member.referrer}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <BubbleRow
            key={member.userId}
            label={member.name}
            value={member.email}
            note={meta || undefined}
            action={
              <div className="ff-staff__controls">
                <button
                  className="ff-btn ff-btn--sm"
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => markVerified(member.userId))}
                >
                  Verify
                </button>
                <button
                  className="ff-btn ff-btn--outline ff-btn--sm"
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setError(null);
                    setDenying(member);
                  }}
                >
                  Ineligible
                </button>
              </div>
            }
          >
            {member.circumstances ? (
              <p className="ff-row__note">{member.circumstances}</p>
            ) : undefined}
          </BubbleRow>
        );
      })}

      <ConfirmDialog
        open={denying !== null}
        title="Mark Ineligible"
        description={
          denying
            ? `${denying.name} will be marked ineligible and can't finish registration from the site. They can appeal through support.`
            : undefined
        }
        confirmLabel="Mark ineligible"
        danger
        busy={pending}
        error={error}
        onConfirm={() => denying && run(() => markIneligible(denying.userId))}
        onClose={() => {
          if (!pending) setDenying(null);
        }}
      />
    </>
  );
}
