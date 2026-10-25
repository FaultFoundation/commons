import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import {
  FormBuilderChrome,
  VerificationSummary,
} from "@/components/dashboard/forms/FormBuilderChrome";
import { FormTitleCard } from "@/components/dashboard/forms/FormTitleCard";
import {
  PlatformLists,
  type PlatformListData,
} from "@/components/dashboard/forms/PlatformLists";
import { QuestionsEditor } from "@/components/dashboard/forms/QuestionsEditor";
import { RequirementsEditor } from "@/components/dashboard/forms/RequirementsEditor";
import { getSessionCached } from "@/lib/session";
import {
  getOwnedForm,
  listFormItemsCached,
  listImportSources,
  listResponsesForExport,
} from "@/lib/signup-forms";
import {
  EVENT_PLATFORMS,
  PLATFORM_LISTS,
  REQUIREMENTS,
  asFormStatus,
  exportColumns,
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

/**
 * The builder, in the Google Forms shape: a header card (back, title, state,
 * share link, tabs), then one of three panels — Questions (the title card, the
 * verification summary and the question cards, with a floating toolbar),
 * Verification (the requirement buckets) and Responses (the table, exports and
 * platform lists). All three are rendered here; FormBuilderChrome mounts the
 * active one.
 */
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

  const [items, rows, importSources] = await Promise.all([
    listFormItemsCached(form.id),
    listResponsesForExport(form.id),
    listImportSources(session.user.id, form.id),
  ]);
  const questions = items.filter((i) => isQuestionKind(i.kind));
  const requirementItems = items.filter((i) => isRequirementKind(i.kind));
  const requirements = REQUIREMENTS.flatMap((def) => {
    const item = requirementItems.find((i) => i.kind === def.kind);
    return item ? [{ label: def.label, required: item.required }] : [];
  });

  // --- Responses panel data: the shared export columns + platform lists. ---
  const columns = exportColumns(items);
  const leadPlatform =
    EVENT_PLATFORMS.find((p) => p.value === form.eventPlatform)?.account ?? null;
  const lists: PlatformListData[] = PLATFORM_LISTS.flatMap((def) => {
    const item = items.find((i) => i.kind === def.kind);
    if (!item) return [];
    const lines = rows.map((r) => def.line(r.values[item.id])).filter(Boolean);
    return [{ kind: def.kind, label: def.label, hint: def.hint, lines, batch: def.batch }];
  }).sort((a, b) => Number(b.kind === leadPlatform) - Number(a.kind === leadPlatform));
  const exportBase = `/api/forms/${form.id}/export`;

  const questionsPanel = (
    <QuestionsEditor
      formId={form.id}
      questions={questions}
      importSources={importSources}
      lead={
        <>
          <FormTitleCard
            formId={form.id}
            title={form.title}
            description={form.description ?? ""}
            responses={rows.length}
            details={{
              hostName: form.hostName ?? "",
              eventUrl: form.eventUrl ?? "",
              eventPlatform: form.eventPlatform ?? "",
              closesAt: form.closesAt?.getTime() ?? null,
            }}
          />
          <VerificationSummary requirements={requirements} />
        </>
      }
    />
  );

  const verificationPanel = (
    <div className="ff-bubble-grid">
      <Bubble title="Verification" span="full">
        <p className="ff-auth__hint">
          What players must have before they can answer. They verify each once on The
          Esports Commons and it carries over to every form, and they&rsquo;re told
          exactly what you&rsquo;ll see before they sign up.
        </p>
        <RequirementsEditor
          formId={form.id}
          items={requirementItems}
          eventPlatform={form.eventPlatform}
        />
      </Bubble>
    </div>
  );

  const responsesPanel = (
    <div className="ff-bubble-grid">
      <Bubble
        title="Sign-Ups"
        span="full"
        actions={
          <div className="ff-row__buttons">
            <a
              className="ff-btn ff-btn--outline ff-btn--sm"
              href={`${exportBase}?format=print`}
              target="_blank"
              rel="noopener"
            >
              Save as PDF
            </a>
            <a className="ff-btn ff-btn--outline ff-btn--sm" href={`${exportBase}?format=csv`}>
              Download CSV
            </a>
          </div>
        }
      >
        <p className="ff-auth__hint">
          {rows.length === 1 ? "1 sign-up" : `${rows.length} sign-ups`}. Each row is what
          the player shared when they last submitted; withdrawn sign-ups aren&rsquo;t
          listed.
        </p>
        {rows.length ? (
          <div className="ff-ticket-table-wrap">
            <table className="ff-ticket-table ff-form-table">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} scope="col">
                      {c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    {columns.map((c) => (
                      <td key={c.key}>{c.get(row)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Bubble>

      <Bubble title="Platform Lists" span="full">
        {lists.length ? (
          <PlatformLists lists={lists} />
        ) : (
          <p className="ff-auth__hint">
            Turn on a FACEIT, start.gg, Challonge, Blizzard or Discord requirement under
            Verification and this fills with handles you can paste into that platform.
          </p>
        )}
      </Bubble>
    </div>
  );

  return (
    <FormBuilderChrome
      formId={form.id}
      title={form.title}
      status={asFormStatus(form.status)}
      path={formPath(form.id)}
      counts={{
        questions: questions.length,
        verification: requirementItems.length,
        responses: rows.length,
      }}
      panels={{
        questions: questionsPanel,
        verification: verificationPanel,
        responses: responsesPanel,
      }}
    />
  );
}
