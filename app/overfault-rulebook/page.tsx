import type { Metadata } from "next";

import { CollapsibleSection } from "@/components/CollapsibleSection";
import { PolicyLayout } from "@/components/PolicyLayout";
import { policyDocBySlug } from "@/lib/policies";

import { preamble, sections } from "./sections";

export const metadata: Metadata = {
  title: "Overfault Rulebook",
  alternates: { canonical: "/overfault-rulebook/" },
  openGraph: {
    description: "Overfault Rulebook ARTICLE I: TOURNAMENT OVERVIEW 1.1 Tournament Name The official name of this tournament shall be Overfault: Fault Foundation Overwatch Tournament, hereafter referred to as the Tournament. 1.2 Tournament Purpose The Tournament is organized exclusively for educational and charitable purposes within the scope of The Fault Foundation’s mission to build a future where gaming […]",
  },
};

export default function OverfaultRulebookPage() {
  return (
    <PolicyLayout doc={policyDocBySlug("overfault-rulebook")}>
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
