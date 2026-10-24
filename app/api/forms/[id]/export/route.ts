import { getSessionCached } from "@/lib/session";
import {
  getForm,
  listFormItems,
  listResponsesForExport,
} from "@/lib/signup-forms";
import {
  exportColumns,
  toCsv,
  type ExportColumn,
  type ExportResponse,
} from "@/lib/signup-forms-shared";

// GET /api/forms/<id>/export?format=csv|print — a form's responses, for its
// owner only. `csv` downloads a spreadsheet-safe file (formula cells defused in
// csvCell); `print` returns a standalone landscape report that opens the
// browser's print dialog, which is how "export as PDF" works without a PDF
// library in the Worker bundle (Save as PDF is in every browser's dialog, and
// it renders names in any script, which a hand-built PDF font table wouldn't).
// Both read the same exportColumns, so they always carry the same fields.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

function slug(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || "sign-up";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function printReport(
  form: { title: string; hostName: string | null },
  columns: ExportColumn[],
  rows: ExportResponse[],
): string {
  const generated = new Date().toUTCString();
  const head = columns.map((c) => `<th>${escapeHtml(c.header)}</th>`).join("");
  const body = rows.length
    ? rows
        .map(
          (r) =>
            `<tr>${columns.map((c) => `<td>${escapeHtml(c.get(r))}</td>`).join("")}</tr>`,
        )
        .join("\n")
    : `<tr><td colspan="${columns.length}">No sign-ups yet.</td></tr>`;
  const host = form.hostName ? ` · ${escapeHtml(form.hostName)}` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<title>${escapeHtml(form.title)} — Sign-Ups</title>
<style>
  @page { size: landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 24px; font: 10pt/1.4 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; background: #fff; }
  h1 { margin: 0 0 4px; font-size: 16pt; }
  p { margin: 0 0 14px; color: #555; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 4px 6px; border: 1px solid #ccc; text-align: left; vertical-align: top; word-break: break-word; }
  th { background: #f1f1f1; font-weight: 700; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  .bar { margin: 0 0 16px; }
  .bar button { font: inherit; padding: 6px 14px; cursor: pointer; }
  @media print { body { margin: 0; } .bar { display: none; } }
</style>
</head>
<body>
<div class="bar"><button type="button" onclick="window.print()">Print or Save as PDF</button></div>
<h1>${escapeHtml(form.title)}</h1>
<p>${rows.length} sign-up${rows.length === 1 ? "" : "s"}${host} · Generated ${escapeHtml(generated)}</p>
<table>
<thead><tr>${head}</tr></thead>
<tbody>
${body}
</tbody>
</table>
<script>window.addEventListener("load", function () { window.print(); });</script>
</body>
</html>`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionCached();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  const { id } = await params;
  const form = await getForm(id);
  // Not yours and doesn't exist read the same, so ids can't be probed.
  if (!form || form.ownerUserId !== session.user.id) {
    return Response.json({ error: "not found" }, { status: 404, headers: NO_STORE });
  }

  const [items, rows] = await Promise.all([
    listFormItems(form.id),
    listResponsesForExport(form.id),
  ]);
  const columns = exportColumns(items);
  const format = new URL(request.url).searchParams.get("format");

  if (format === "print") {
    return new Response(printReport(form, columns, rows), {
      headers: { "Content-Type": "text/html; charset=utf-8", ...NO_STORE },
    });
  }

  // The BOM makes Excel read the file as UTF-8 instead of mangling non-ASCII names.
  return new Response(`﻿${toCsv(columns, rows)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug(form.title)}-sign-ups.csv"`,
      ...NO_STORE,
    },
  });
}
