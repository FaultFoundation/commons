/**
 * Table-of-contents metadata for the four policy documents. Section
 * headings are verbatim copies of the h2 "ARTICLE …" headings in each
 * document; the groups mirror the original related-documents sidebar
 * ("Policies" / "Other Documents").
 */

export type PolicySection = {
  /** Anchor id placed on the section's <details> element. */
  id: string;
  /** Exact heading text as it appears in the document. */
  heading: string;
};

export type PolicyDoc = {
  slug: "bylaws" | "privacy-policy" | "disciplinary-policy" | "overfault-rulebook";
  /** Link label, exactly as in the original sidebar. */
  title: string;
  path: `/${string}/`;
  group: "Policies" | "Other Documents";
  sections: PolicySection[];
};

export const policyDocs: PolicyDoc[] = [
  {
    slug: "bylaws",
    title: "Bylaws",
    path: "/bylaws/",
    group: "Policies",
    sections: [
      { id: "article-i", heading: "ARTICLE I: NAME AND PURPOSE" },
      { id: "article-ii", heading: "ARTICLE II: MEMBERSHIP" },
      { id: "article-iii", heading: "ARTICLE III: LEADERSHIP STRUCTURE" },
      { id: "article-iv", heading: "ARTICLE IV: DECLARED ABSENCE AND REMOVAL" },
      { id: "article-v", heading: "ARTICLE V: AMENDMENTS" },
      { id: "article-vi", heading: "ARTICLE VI: DISSOLUTION" },
    ],
  },
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    path: "/privacy-policy/",
    group: "Policies",
    sections: [
      { id: "article-i", heading: "ARTICLE I: PURPOSE AND SCOPE" },
      { id: "article-ii", heading: "ARTICLE II: DEFINITIONS" },
      { id: "article-iii", heading: "ARTICLE III: DATA COLLECTED" },
      { id: "article-iv", heading: "ARTICLE IV: DATA USAGE" },
      { id: "article-v", heading: "ARTICLE V: DATA ACCESS AND SHARING" },
      { id: "article-vi", heading: "ARTICLE VI: DATA SECURITY" },
      { id: "article-vii", heading: "ARTICLE VII: USER RIGHTS" },
      { id: "article-viii", heading: "ARTICLE VIII: CHILDREN’S PRIVACY" },
      { id: "article-ix", heading: "ARTICLE IX: POLICY MAINTENANCE" },
      { id: "article-x", heading: "ARTICLE X: ACKNOWLEDGMENT" },
    ],
  },
  {
    slug: "disciplinary-policy",
    title: "Disciplinary Policy",
    path: "/disciplinary-policy/",
    group: "Policies",
    sections: [
      { id: "article-i", heading: "ARTICLE I: PURPOSE AND SCOPE" },
      { id: "article-ii", heading: "ARTICLE II: CORE PRINCIPLES" },
      { id: "article-iii", heading: "ARTICLE III: DEFINITIONS" },
      { id: "article-iv", heading: "ARTICLE IV: POINT-BASED DISCIPLINARY SYSTEM" },
      { id: "article-v", heading: "ARTICLE V: REPORTING PROCEDURES" },
      { id: "article-vi", heading: "ARTICLE VI: INVESTIGATION PROCEDURES" },
      { id: "article-vii", heading: "ARTICLE VII: DUE PROCESS AND APPEALS" },
      { id: "article-viii", heading: "ARTICLE VIII: MANAGEMENT PROCEDURES" },
      { id: "article-ix", heading: "ARTICLE IX: SPECIAL PROVISIONS" },
      { id: "article-x", heading: "ARTICLE X: POLICY MAINTENANCE" },
    ],
  },
  {
    slug: "overfault-rulebook",
    title: "Overfault Rulebook",
    path: "/overfault-rulebook/",
    group: "Other Documents",
    sections: [
      { id: "article-i", heading: "ARTICLE I: TOURNAMENT OVERVIEW" },
      { id: "article-ii", heading: "ARTICLE II: REGISTRATION AND ELIGIBILITY" },
      { id: "article-iii", heading: "ARTICLE III: TEAM STRUCTURE" },
      { id: "article-iv", heading: "ARTICLE IV: TOURNAMENT FORMAT" },
      { id: "article-v", heading: "ARTICLE V: MATCH PROCEDURES" },
      { id: "article-vi", heading: "ARTICLE VI: TECHNICAL REQUIREMENTS" },
      { id: "article-vii", heading: "ARTICLE VII: MATCH RESCHEDULING" },
      { id: "article-viii", heading: "ARTICLE VIII: CONDUCT AND COMPLIANCE" },
      { id: "article-ix", heading: "ARTICLE IX: PRIZING" },
      { id: "article-x", heading: "ARTICLE X: TOURNAMENT ADMINISTRATION" },
      { id: "article-xi", heading: "ARTICLE XI: AMENDMENTS" },
      { id: "article-xii", heading: "ARTICLE XII: ACCEPTANCE OF RULES" },
    ],
  },
];

export const policyDocBySlug = (slug: PolicyDoc["slug"]): PolicyDoc =>
  policyDocs.find((doc) => doc.slug === slug)!;
