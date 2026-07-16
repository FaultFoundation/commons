import type { ReactNode } from "react";

import { HashTarget } from "./HashTarget";
import { policyDocs, type PolicyDoc } from "@/lib/policies";

/**
 * Shared shell for the four policy documents: compact hero, sticky
 * table of contents (per-ARTICLE anchors + the original related-docs
 * groups), and the collapsible-section content column.
 */
export function PolicyLayout({
  doc,
  children,
}: {
  doc: PolicyDoc;
  children: ReactNode;
}) {
  const docLink = (d: PolicyDoc) => (
    <li key={d.slug}>
      <a href={d.path} aria-current={d.slug === doc.slug ? "page" : undefined}>
        {d.title}
      </a>
    </li>
  );

  return (
    <main id="wp--skip-link--target" className="ff-main">
      <HashTarget />
      <div className="ff-container ff-container--wide">
        <section
          className="ff-hero ff-hero--compact"
          style={{
            backgroundImage:
              "url('/wp-content/uploads/2025/10/Fault-Foundation-Images-1.png')",
          }}
        >
          <div className="ff-hero__inner">
            <h1 className="ff-hero__title">{doc.title}</h1>
          </div>
        </section>
      </div>

      <div className="ff-container ff-policy ff-section--tight">
        <aside className="ff-card ff-toc" aria-label="Table of contents">
          <p className="ff-toc__heading">{doc.title}</p>
          <ul>
            {doc.sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>{section.heading}</a>
              </li>
            ))}
          </ul>
          <p className="ff-toc__heading">
            <a href="/policies/">Policies</a>
          </p>
          <ul>{policyDocs.filter((d) => d.group === "Policies").map(docLink)}</ul>
          <p className="ff-toc__heading">Other Documents</p>
          <ul>
            {policyDocs.filter((d) => d.group === "Other Documents").map(docLink)}
          </ul>
        </aside>
        <div className="ff-policy__content">{children}</div>
      </div>
    </main>
  );
}
