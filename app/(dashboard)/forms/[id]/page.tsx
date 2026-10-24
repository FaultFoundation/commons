import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { CopyButton } from "@/components/dashboard/forms/CopyButton";
import { FormDetailsEditor } from "@/components/dashboard/forms/FormDetailsEditor";
import {
  DeleteFormButton,
  FormStatusControl,
} from "@/components/dashboard/forms/FormOwnerControls";
import { QuestionsEditor } from "@/components/dashboard/forms/QuestionsEditor";
import { RequirementsEditor } from "@/components/dashboard/forms/RequirementsEditor";
import { getSessionCached } from "@/lib/session";
import {
  countResponses,
  getOwnedForm,
  listFormItemsCached,
} from "@/lib/signup-forms";
import {
  FORM_STATUS_LABELS,
  asFormStatus,
  formPath,
  isQuestionKind,
  isRequirementKind,
} from "@/lib/signup-forms-shared";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit Sign-Up Form",
  robots: { index: false },
};

/** The builder: share state first, then the form's header, buckets, questions. */
export default async function FormBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionCached();
  if (!session) redirect("/login/");
  const { id } = await params;
  // Someone else's form reads as missing, so ids can't be probed.
  const form = await getOwnedForm(session.user.id, id);
  if (!form) notFound();

  const [items, responses] = await Promise.all([
    listFormItemsCached(form.id),
    countResponses(form.id),
  ]);
  const status = asFormStatus(form.status);
  const path = formPath(form.id);

  return (
    <>
      <h1 className="screen-reader-text">Edit Sign-Up Form</h1>
      <div className="ff-bubble-grid">
        <Bubble
          title={form.title}
          span="full"
          actions={<span className="ff-badge">{FORM_STATUS_LABELS[status]}</span>}
        >
          <BubbleRow
            label="Status"
            value={
              status === "draft"
                ? "Only you can open the link while it's a draft."
                : status === "open"
                  ? "Anyone with the link can sign up."
                  : "The link shows the form as closed."
            }
            action={<FormStatusControl formId={form.id} status={status} />}
          />
          <BubbleRow
            label="Share Link"
            value={path}
            action={
              <div className="ff-row__buttons">
                <a className="ff-btn ff-btn--outline ff-btn--sm" href={path} target="_blank" rel="noopener">
                  Preview
                </a>
                <CopyButton path={path} label="Copy Link" small />
              </div>
            }
          />
          <BubbleRow
            label="Sign-Ups"
            value={responses === 1 ? "1 sign-up" : `${responses} sign-ups`}
            action={
              <a className="ff-btn ff-btn--outline ff-btn--sm" href={`/forms/${form.id}/responses/`}>
                Responses
              </a>
            }
          />
        </Bubble>

        <Bubble title="Details" span="full">
          <FormDetailsEditor
            formId={form.id}
            initial={{
              title: form.title,
              hostName: form.hostName ?? "",
              description: form.description ?? "",
              eventUrl: form.eventUrl ?? "",
              eventPlatform: form.eventPlatform ?? "",
              closesAt: form.closesAt?.getTime() ?? null,
            }}
          />
        </Bubble>

        <Bubble title="Requirements" span="full">
          <p className="ff-auth__hint">
            Players verify each of these once on The Esports Commons, and it carries over
            to every form. They&rsquo;re told exactly what you&rsquo;ll see before they
            sign up.
          </p>
          <RequirementsEditor
            formId={form.id}
            items={items.filter((i) => isRequirementKind(i.kind))}
            eventPlatform={form.eventPlatform}
          />
        </Bubble>

        <Bubble title="Questions" span="full">
          <QuestionsEditor
            formId={form.id}
            questions={items.filter((i) => isQuestionKind(i.kind))}
          />
        </Bubble>

        <Bubble title="Danger Zone" variant="danger" span="full">
          <BubbleRow
            label="Delete form"
            value="Removes the form, its link and every sign-up."
            action={
              <DeleteFormButton formId={form.id} title={form.title} responses={responses} />
            }
          />
        </Bubble>
      </div>
    </>
  );
}
