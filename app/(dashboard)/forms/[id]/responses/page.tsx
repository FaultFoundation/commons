import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import {
  PlatformLists,
  type PlatformListData,
} from "@/components/dashboard/forms/PlatformLists";
import { getSessionCached } from "@/lib/session";
import {
  getOwnedForm,
  listFormItemsCached,
  listResponsesForExport,
} from "@/lib/signup-forms";
import {
  EVENT_PLATFORMS,
  PLATFORM_LISTS,
  exportColumns,
} from "@/lib/signup-forms-shared";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign-Ups",
  robots: { index: false },
};

/**
 * Who signed up, as the same columns the CSV and the PDF carry, then the
 * per-platform handle lists — the import path into start.gg, FACEIT and
 * Challonge, none of which takes an organizer's roster over an API.
 */
export default async function FormResponsesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionCached();
  if (!session) redirect("/login/");
  const { id } = await params;
  const form = await getOwnedForm(session.user.id, id);
  if (!form) notFound();

  const [items, rows] = await Promise.all([
    listFormItemsCached(form.id),
    listResponsesForExport(form.id),
  ]);
  const columns = exportColumns(items);

  // The event's own platform leads; then the registry order.
  const lead = EVENT_PLATFORMS.find((p) => p.value === form.eventPlatform)?.account ?? null;
  const lists: PlatformListData[] = PLATFORM_LISTS.flatMap((def) => {
    const item = items.find((i) => i.kind === def.kind);
    if (!item) return [];
    const lines = rows.map((r) => def.line(r.values[item.id])).filter(Boolean);
    return [{ kind: def.kind, label: def.label, hint: def.hint, lines, batch: def.batch }];
  }).sort((a, b) => Number(b.kind === lead) - Number(a.kind === lead));

  const exportBase = `/api/forms/${form.id}/export`;

  return (
    <>
      <h1 className="screen-reader-text">Sign-Ups</h1>
      <div className="ff-bubble-grid">
        <Bubble
          title={form.title}
          span="full"
          actions={
            <div className="ff-row__buttons">
              <a className="ff-btn ff-btn--outline ff-btn--sm" href={`/forms/${form.id}/`}>
                Edit Form
              </a>
              <a className="ff-btn ff-btn--outline ff-btn--sm" href={`${exportBase}?format=print`} target="_blank" rel="noopener">
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
              Turn on a FACEIT, start.gg, Challonge, Blizzard or Discord requirement and
              this fills with handles you can paste into that platform.
            </p>
          )}
        </Bubble>
      </div>
    </>
  );
}
