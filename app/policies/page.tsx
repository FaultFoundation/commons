import type { Metadata } from "next";

import { policyDocs } from "@/lib/policies";

export const metadata: Metadata = {
  title: "Policies",
  alternates: { canonical: "/policies/" },
  openGraph: {
    description: "Policies and Procedures Transparency at Our Core",
  },
};

export default function PoliciesPage() {
  return (
    <main id="wp--skip-link--target" className="ff-main">
      <div className="ff-container ff-container--wide">
        <section
          className="ff-hero ff-hero--compact"
          style={{
            backgroundImage:
              "url('/wp-content/uploads/2025/10/Fault-Foundation-Images-1.png')",
          }}
        >
          <div className="ff-hero__inner">
            <h1 className="ff-hero__title">Policies and Procedures</h1>
            <p className="ff-hero__subtitle">Transparency at Our Core</p>
          </div>
        </section>
      </div>

      <div className="ff-container ff-section--tight">
        <div className="ff-policy-hub">
          {policyDocs.map((doc) => (
            <section key={doc.slug} className="ff-card">
              <h2>
                <a href={doc.path}>{doc.title}</a>
              </h2>
              <ul>
                {doc.sections.map((section) => (
                  <li key={section.id}>
                    <a href={`${doc.path}#${section.id}`}>{section.heading}</a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
