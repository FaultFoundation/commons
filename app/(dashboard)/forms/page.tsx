import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { NewFormButton } from "@/components/dashboard/forms/FormOwnerControls";
import { getSessionCached } from "@/lib/session";
import { listMyForms } from "@/lib/signup-forms";
import {
  FORM_STATUS_LABELS,
  asFormStatus,
  formPath,
} from "@/lib/signup-forms-shared";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign-Up Forms",
  robots: { index: false },
};

/**
 * The organizer's forms. Any member can build one (there is no organizer role
 * yet): pick what players must verify, add questions, share /f/<id>/, export
 * who signed up.
 */
export default async function FormsPage() {
  const session = await getSessionCached();
  if (!session) redirect("/login/");

  const forms = await listMyForms(session.user.id);

  return (
    <>
      <h1 className="screen-reader-text">Sign-Up Forms</h1>
      <div className="ff-bubble-grid">
        <Bubble title="Sign-Up Forms" span="full" actions={<NewFormButton />}>
          <p className="ff-auth__hint">
            Build a sign-up link for your event. Choose what players must verify (school,
            Discord server, a public Overwatch profile, linked FACEIT or start.gg
            accounts), add your own questions, share the link, then export who signed up
            as a CSV, a PDF, or lists ready to paste into your tournament platform.
          </p>
          {forms.length ? (
            forms.map((form) => (
              <BubbleRow
                key={form.id}
                label={form.title}
                value={`${FORM_STATUS_LABELS[asFormStatus(form.status)]} · ${
                  form.responses === 1 ? "1 sign-up" : `${form.responses} sign-ups`
                }`}
                note={formPath(form.id)}
                action={
                  <div className="ff-row__buttons">
                    <Link className="ff-btn ff-btn--outline ff-btn--sm" href={`/forms/${form.id}/?tab=responses`}>
                      Responses
                    </Link>
                    <Link className="ff-btn ff-btn--outline ff-btn--sm" href={`/forms/${form.id}/`}>
                      Edit
                    </Link>
                  </div>
                }
              />
            ))
          ) : (
            <p className="ff-auth__hint">You haven&rsquo;t made a form yet.</p>
          )}
        </Bubble>
      </div>
    </>
  );
}
