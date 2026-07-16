import type { ReactNode } from "react";

/**
 * privacy-policy content, split into collapsible ARTICLE sections. Generated
 * from the original ported markup by scripts/gen-policy-sections.mjs —
 * the text is verbatim; only WP wrapper markup/classes were removed.
 */

export type PolicyContentSection = {
  id: string;
  heading: string;
  body: ReactNode;
};

export const preamble: ReactNode = null;

export const sections: PolicyContentSection[] = [
  {
    id: "article-i",
    heading: "ARTICLE I: PURPOSE AND SCOPE",
    body: (
      <>
        <h3>1.1 Purpose</h3>
        <p>This policy establishes the Fault Foundation’s commitment to protecting the privacy and security of community members by outlining data collection, usage, and access practices.</p>
        <h3>1.2 Summary</h3>
        <p>The Fault Foundation does not sell, trade, rent, or distribute personal data to third parties. All information collected is used exclusively for verifying student or alumni status and for server moderation purposes. Access to personal data is strictly limited to the Board of Directors. This policy ensures transparency and accountability in how member information is handled.</p>
        <h3>1.3 Scope</h3>
        <p>This policy applies to:</p>
        <ul><li>Information collected via the Member Registration Form.</li><li>Communication and support tickets submitted through the Fault Foundation Discord Server.</li><li>Data reviewed by the Fault Foundation Board of Directors.</li></ul>
        <h3>1.4 Legal Compliance</h3>
        <p>Nothing in this policy supersedes applicable law and any illegal activities will be reported to authorities. Legal counsel will be consulted for serious violations. This policy fulfills requirements under: the Missouri Nonprofit Corporation Act, IRS Form 1023, and 501(c)(3) regulations, and other Federal and state charitable solicitation laws.</p>
      </>
    ),
  },
  {
    id: "article-ii",
    heading: "ARTICLE II: DEFINITIONS",
    body: (
      <>
        <ul><li><strong>Board</strong>: The Fault Foundation Board of Directors.</li><li><strong>Member</strong>: Any individual who has completed the registration process and been granted access to the Discord server.</li><li><strong>Personal Data</strong>: Any information that identifies or can be used to identify an individual.</li><li><strong>Third-Party Service Provider</strong>: External platforms used to collect, store, or process data on behalf of the Fault Foundation.</li></ul>
      </>
    ),
  },
  {
    id: "article-iii",
    heading: "ARTICLE III: DATA COLLECTED",
    body: (
      <>
        <h3>3.1 Data Minimization</h3>
        <p>The Foundation only collects information necessary to verify member eligibility and facilitate community interaction.</p>
        <h3>3.2 Registration Data</h3>
        <ul><li><strong>Identity</strong>: Discord username, Discord account ID, school-issued email address, and personal email address (if applicable).</li><li><strong>Demographics</strong>: Age range.</li><li><strong>Educational background</strong>: University/college/high school name and website</li><li><strong>Background information</strong> (for manual verification purposes): Brief description of circumstances and referral source.</li><li><strong>Feedback</strong>: User experience regarding the registration process.</li></ul>
        <h3>3.3 Operational Data</h3>
        <ul><li><strong>Discord Activity</strong>: Messages sent within the Discord server may be reviewed for moderation, safety, and support ticket resolution.</li><li><strong>Referrals</strong>: Discord IDs of existing members known to the applicant.</li></ul>
      </>
    ),
  },
  {
    id: "article-iv",
    heading: "ARTICLE IV: DATA USAGE",
    body: (
      <>
        <p>Collected data is used strictly for the following internal purposes:</p>
        <ul><li><strong>Verification</strong>: To confirm current student or alumni status at claimed educational institutions and grant appropriate roles, permissions, and access within the Discord server.</li><li><strong>Support</strong>: To respond to inquiries, support tickets, and moderation issues.</li><li><strong>Service Improvement</strong>: To understand member demographics and improve Foundation services based on feedback.</li></ul>
      </>
    ),
  },
  {
    id: "article-v",
    heading: "ARTICLE V: DATA ACCESS AND SHARING",
    body: (
      <>
        <h3>5.1 Internal Access</h3>
        <p>Access to personal data is restricted to the Board. General members and volunteer moderators do not have access to raw registration data. In the event raw registration data is required, a member of the Board will be involved to resolve the issue.</p>
        <h3>5.2 Third-Party Service Providers</h3>
        <p>The Foundation uses trusted platforms to collect and store data. Data is processed on their infrastructure but is not shared for marketing purposes:</p>
        <ul><li><strong>Discord</strong>: Used for community communication. Users are subject to Discord’s Privacy Policy.</li><li><strong>Google Workspace</strong>: Used to collect and store data submissions securely.</li><li><strong>Pebblehost</strong>: Used to host the Fault Foundation Discord bot and its features.</li></ul>
        <h3>5.3 Legal Requirements</h3>
        <p>The Foundation may disclose information if required by law, such as in response to a subpoena, or to protect the rights, property, and safety of the Foundation and its members.</p>
      </>
    ),
  },
  {
    id: "article-vi",
    heading: "ARTICLE VI: DATA SECURITY",
    body: (
      <>
        <p>The Foundation implements the following security measures to protect against unauthorized access:</p>
        <ul><li>Access to the registration database is limited to Board members. All Board members are required to have two-factor-authentication enabled.</li><li>Audit logs, output consoles, bug reports, and security reports are regularly reviewed by Board members. </li></ul>
      </>
    ),
  },
  {
    id: "article-vii",
    heading: "ARTICLE VII: USER RIGHTS",
    body: (
      <>
        <p>Members have the following rights regarding their personal data. To exercise these rights, open a support ticket in the Discord server or contact a Board member directly.</p>
        <ul><li><strong>Request Access</strong>: Obtain a copy of the personal data held by the Foundation.</li></ul>
        <ul><li><strong>Request Correction</strong>: Update any incorrect or outdated information.</li><li><strong>Request Deletion</strong>: Request removal of registration data. When registration data is deleted, the user will lose access to channels restricted to verified members in the Discord server.</li></ul>
      </>
    ),
  },
  {
    id: "article-viii",
    heading: "ARTICLE VIII: CHILDREN’S PRIVACY",
    body: (
      <>
        <p>The Foundation operates on the Discord platform, which requires users to be at least 13 years of age. The Foundation does not knowingly collect personal information from children under 13. If such information is discovered, it will be deleted immediately.</p>
      </>
    ),
  },
  {
    id: "article-ix",
    heading: "ARTICLE IX: POLICY MAINTENANCE",
    body: (
      <>
        <h3>9.1 Review Schedule</h3>
        <p>This policy shall be reviewed annually in December by the Board to ensure continued compliance and relevance.</p>
        <h3>9.2 Amendment Process</h3>
        <p>Amendments to this policy require Board approval. Members will be notified of material changes via the Discord server.</p>
      </>
    ),
  },
  {
    id: "article-x",
    heading: "ARTICLE X: ACKNOWLEDGMENT",
    body: (
      <>
        <p>By submitting the registration form or participating in the Fault Foundation Discord server, members acknowledge that they have read and understood this Privacy Policy.</p>
      </>
    ),
  },
];
