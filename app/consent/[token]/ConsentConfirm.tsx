"use client";

import { useState, useTransition } from "react";

import { confirmParentalConsent } from "./actions";

/**
 * The parent's confirm control. Consent is an affirmative click, not an
 * on-load side effect — see the note in actions.ts.
 */
export function ConsentConfirm({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await confirmParentalConsent(token);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="ff-card ff-reg">
        <h1 className="ff-reg__title">Thank You</h1>
        <p>
          You&rsquo;ve approved the account — they&rsquo;re all set. You can
          close this tab.
        </p>
      </div>
    );
  }

  return (
    <div className="ff-card ff-reg">
      <h1 className="ff-reg__title">Approve This Account</h1>
      <p>
        Someone listed you as their parent or guardian while signing up for the
        Fault Foundation, a collegiate and community Overwatch organization.
        Because they&rsquo;re under 18, your approval activates their account. No
        documents or personal details are needed.
      </p>
      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}
      <div className="ff-reg__nav">
        <span />
        <button
          className="ff-btn"
          type="button"
          disabled={pending}
          onClick={confirm}
        >
          {pending ? "Approving…" : "I approve"}
        </button>
      </div>
    </div>
  );
}
