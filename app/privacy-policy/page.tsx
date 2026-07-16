import type { Metadata } from "next";

import { CollapsibleSection } from "@/components/CollapsibleSection";
import { PolicyLayout } from "@/components/PolicyLayout";
import { policyDocBySlug } from "@/lib/policies";

import { preamble, sections } from "./sections";

export const metadata: Metadata = {
  title: "Privacy Policy",
  alternates: { canonical: "/privacy-policy/" },
  openGraph: {
    description: "Privacy Policy ARTICLE I: PURPOSE AND SCOPE 1.1 Purpose This policy establishes the Fault Foundation’s commitment to protecting the privacy and security of community members by outlining data collection, usage, and access practices. 1.2 Summary The Fault Foundation does not sell, trade, rent, or distribute personal data to third parties. All information collected is used […]",
  },
};

export default function PrivacyPolicyPage() {
  return (
    <PolicyLayout doc={policyDocBySlug("privacy-policy")}>
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
