import type { Metadata } from "next";

import { CollapsibleSection } from "@/components/CollapsibleSection";
import { PolicyLayout } from "@/components/PolicyLayout";
import { policyDocBySlug } from "@/lib/policies";

import { preamble, sections } from "./sections";

export const metadata: Metadata = {
  title: "Disciplinary Policy",
  alternates: { canonical: "/disciplinary-policy/" },
  openGraph: {
    description: "Disciplinary Policy DISCIPLINARY POLICY ARTICLE I: PURPOSE AND SCOPE 1.1 Purpose This Disciplinary Policy establishes standards of conduct and a fair, consistent point-based system for addressing violations within The Fault Foundation community and leadership. This policy supports our mission to foster a respectful, inclusive gaming environment while ensuring compliance with Missouri nonprofit law and IRS […]",
  },
};

export default function DisciplinaryPolicyPage() {
  return (
    <PolicyLayout doc={policyDocBySlug("disciplinary-policy")}>
      {preamble}
      {sections.map((section, index) => (
        <CollapsibleSection
          key={section.id}
          id={section.id}
          heading={section.heading}
          defaultOpen={index === 0}
        >
          {section.body}
        </CollapsibleSection>
      ))}
    </PolicyLayout>
  );
}
