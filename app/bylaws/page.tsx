import type { Metadata } from "next";

import { CollapsibleSection } from "@/components/CollapsibleSection";
import { PolicyLayout } from "@/components/PolicyLayout";
import { policyDocBySlug } from "@/lib/policies";

import { preamble, sections } from "./sections";

export const metadata: Metadata = {
  title: "Bylaws",
  alternates: { canonical: "/bylaws/" },
  openGraph: {
    description: "Bylaws Bylaws ARTICLE I: NAME AND PURPOSE 1.1 Name The name of this organization shall be Fault Foundation Inc., hereafter The Fault Foundation. 1.2 Purpose PURPOSE: The corporation is organized exclusively for charitable, educational, religious, or scientific purposes within the meaning of Section 501 (c) (3) of the Internal Revenue Code. INUREMENT OF INCOME: No […]",
  },
};

export default function BylawsPage() {
  return (
    <PolicyLayout doc={policyDocBySlug("bylaws")}>
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
