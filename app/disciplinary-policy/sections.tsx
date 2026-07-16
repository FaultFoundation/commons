import type { ReactNode } from "react";

/**
 * disciplinary-policy content, split into collapsible ARTICLE sections. Generated
 * from the original ported markup by scripts/gen-policy-sections.mjs —
 * the text is verbatim; only WP wrapper markup/classes were removed.
 */

export type PolicyContentSection = {
  id: string;
  heading: string;
  body: ReactNode;
};

export const preamble: ReactNode = (
  <>
    <h2 id="disciplinary-policy"><span style={{ textDecoration: "underline" }}><strong>DISCIPLINARY POLICY</strong></span></h2>
  </>
);

export const sections: PolicyContentSection[] = [
  {
    id: "article-i",
    heading: "ARTICLE I: PURPOSE AND SCOPE",
    body: (
      <>
        <h3>1.1 Purpose</h3>
        <p>This Disciplinary Policy establishes standards of conduct and a fair, consistent point-based system for addressing violations within The Fault Foundation community and leadership. This policy supports our mission to foster a respectful, inclusive gaming environment while ensuring compliance with Missouri nonprofit law and IRS 501(c)(3) requirements.</p>
        <h3>1.2 Scope and Applicability</h3>
        <p>This policy applies to all individuals engaged with The Fault Foundation, including:</p>
        <ul><li>Board of Directors (BOD),</li><li>Officers,</li><li>Chairs,</li><li>Committee members,</li><li>Members, </li><li>Event participants, and</li><li>Partners.</li></ul>
        <h3>1.3 Legal Compliance</h3>
        <p>Nothing in this policy supersedes applicable law and any illegal activities will be reported to authorities. Legal counsel will be consulted for serious violations. This policy fulfills requirements under: the Missouri Nonprofit Corporation Act, IRS Form 1023, and 501(c)(3) regulations, and other Federal and state charitable solicitation laws.</p>
      </>
    ),
  },
  {
    id: "article-ii",
    heading: "ARTICLE II: CORE PRINCIPLES",
    body: (
      <>
        <p>All members of The Fault Foundation community shall:</p>
        <ol><li><strong>Demonstrate Respect:</strong> Treat all individuals with dignity and consideration.</li><li><strong>Maintain Integrity:</strong> Act honestly and ethically in all interactions.</li><li><strong>Embody Transparency:</strong> Disclose all potential conflicts promptly.</li><li><strong>Ensure Accountability:</strong> Accept responsibility for actions and their consequences.</li><li><strong>Promote Inclusivity:</strong> Foster an environment welcoming to all backgrounds.</li><li><strong>Uphold Mission:</strong> Support The Fault Foundation’s gaming and educational objectives.</li></ol>
      </>
    ),
  },
  {
    id: "article-iii",
    heading: "ARTICLE III: DEFINITIONS",
    body: (
      <>
        <ul><li><strong>Harassment:</strong> Any unwelcome conduct based on protected characteristics or that creates a hostile environment.</li><li><strong>Spamming:</strong> Any excessive posting of the same topic that disrupts normal communication flow.</li><li><strong>Conflict of Interest:</strong> Any situation where personal interests may compromise organizational duties.</li><li><strong>Violation Thread:</strong> A private communication channel for addressing disciplinary matters.</li></ul>
      </>
    ),
  },
  {
    id: "article-iv",
    heading: "ARTICLE IV: POINT-BASED DISCIPLINARY SYSTEM",
    body: (
      <>
        <h3>4.1 Point Accumulation Framework</h3>
        <ul><li>Points accumulate over a rolling 12-month period.</li><li>Points expire 12 months from the date of infraction or upon completion of a ban period.</li><li>All violations receive automatic base points plus potential additional points.</li><li>Points are tracked centrally by the President or designated officer.</li></ul>
        <h3>4.2 Disciplinary Action Thresholds</h3>
        <figure className="ff-table-wrap"><table><thead><tr><th><strong>Total Points</strong></th><th><strong>Action Required</strong></th><th><strong>Duration</strong></th><th><strong>Additional Requirements</strong></th></tr></thead><tbody><tr><td>2 points</td><td>Warning + Timeout</td><td>12 hours</td><td>Written acknowledgment of violation</td></tr><tr><td>4 points</td><td>Extended Timeout</td><td>48 hours</td><td>Written apology and behavior agreement</td></tr><tr><td>6 points</td><td>Suspension</td><td>7 days</td><td>Remediation plan required</td></tr><tr><td>8 points</td><td>Extended Suspension</td><td>30 days</td><td>BOD review for reinstatement</td></tr><tr><td>10+ points</td><td>Ban/Removal</td><td>60 day minimum</td><td>Formal appeal required for return</td></tr></tbody></table></figure>
        <h3>4.3 Infraction Categories and Point Values</h3>
        <h4><strong>CATEGORY A: DIGITAL CONDUCT VIOLATIONS</strong></h4>
        <figure className="ff-table-wrap"><table><thead><tr><th><strong>Infraction</strong></th><th><strong>Base Points</strong></th><th><strong>Additional Points/Notes</strong></th></tr></thead><tbody><tr><td>Disrespectful communication</td><td>1</td><td>+1 for severity</td></tr><tr><td>Spamming/flooding</td><td>1</td><td>+1 if after warning</td></tr><tr><td>Inappropriate content sharing</td><td>2</td><td>+2 for explicit material</td></tr><tr><td>Privacy violations</td><td>2</td><td>+2 for malicious intent</td></tr><tr><td>Harassment/discrimination</td><td>2</td><td>+2 for targeted campaigns</td></tr><tr><td>Representing Foundation poorly externally</td><td>2</td><td>+1-2 based on impact</td></tr><tr><td>Platform manipulation/cheating</td><td>3</td><td>+3 for tournament context</td></tr><tr><td>Ban evasion attempts</td><td>Permanent ban</td><td>Permanent ban</td></tr></tbody></table></figure>
        <h4><strong>CATEGORY B: LEADERSHIP CONDUCT</strong></h4>
        <figure className="ff-table-wrap"><table><thead><tr><th><strong>Infraction</strong></th><th><strong>Base Points</strong></th><th><strong>Additional Points/Notes</strong></th></tr></thead><tbody><tr><td>Missing deadline without notice</td><td>1</td><td>+1 for critical items</td></tr><tr><td>Inadequate work quality</td><td>1</td><td>+1 for repeated violation</td></tr><tr><td>Failure to communicate (48+ hours)</td><td>1</td><td>+1 for urgent matters</td></tr><tr><td>Multiple Hats Policy violation</td><td>1</td><td>+1 for repeated violation</td></tr><tr><td>Conflict of interest violation</td><td>2</td><td>+3 for financial benefit</td></tr><tr><td>Breach of confidentiality</td><td>2</td><td>+1 for material breach</td></tr><tr><td>Missing 2+ consecutive meetings</td><td>2</td><td>+2 without valid excuse</td></tr><tr><td>Fiduciary duty breach</td><td>4</td><td>+4 for financial loss</td></tr></tbody></table></figure>
      </>
    ),
  },
  {
    id: "article-v",
    heading: "ARTICLE V: REPORTING PROCEDURES",
    body: (
      <>
        <h3>5.1 When to Report</h3>
        <ul><li>After witnessing a potential policy violation.</li><li>Before a planned policy violation.</li></ul>
        <h3>5.2 How to Report</h3>
        <ul><li><strong>Deadline</strong>: Reports must be submitted within 14 days of the incident.</li><li><strong>Method</strong>: Submit violation reports to the President.</li></ul>
        <h3>5.2 What to Report</h3>
        <ol><li>The date and time of the incident.</li><li>All alleged policy violators.</li><li>Any witnesses to the incident.</li><li>Any available evidence such as screenshots or logs.</li><li>A detailed description of the alleged violation with references to policies.</li></ol>
        <h3>5.2 Investigation Process</h3>
        <ol><li><strong>Initial Review:</strong> Within 24 hours of report receipt.</li><li><strong>Violation Thread Creation:</strong> Private channel established with accused party.</li><li><strong>Evidence Collection:</strong> 72-hour period for gathering information.</li><li><strong>Opportunity to Respond:</strong> Accused given 48 hours to provide explanation.</li><li><strong>Determination:</strong> Decision made within 7 days of report.</li></ol>
      </>
    ),
  },
  {
    id: "article-vi",
    heading: "ARTICLE VI: INVESTIGATION PROCEDURES",
    body: (
      <>
        <h3>6.1 When to Investigate</h3>
        <ul><li>Within 24 hours of report receipt.</li></ul>
        <h3>6.2 How to Investigate</h3>
        <ol><li>Establish a private violation thread with the accused party.</li><li>Spend 72-hours gathering information.</li><li>Give the accused 48 hours to respond to the evidence collected..</li><li>Send a final determination within 7 days of report receipt.</li></ol>
        <h3>6.3 What to Investigate</h3>
        <ul><li>Documents provided in the report.</li><li>Witnesses identified in the report.</li><li>Any publicly available information.</li><li>Potential context surrounding the event.</li></ul>
        <h3>6.4 Victim Communication</h3>
        <ul><li>Victims notified of action taken within 24 hours of determination.</li><li>Specific disciplinary details kept confidential.</li><li>Support resources provided as appropriate.</li></ul>
      </>
    ),
  },
  {
    id: "article-vii",
    heading: "ARTICLE VII: DUE PROCESS AND APPEALS",
    body: (
      <>
        <h3>7.1 Due Process Rights</h3>
        <p>All accused individuals have the right to:</p>
        <ul><li>Know specific allegations against them.</li><li>Review evidence presented.</li><li>Provide explanation and context.</li><li>Have violations documented properly.</li><li>Appeal disciplinary decisions.</li></ul>
        <h3>7.2 Appeals Process</h3>
        <ol><li>File<strong> </strong>a written appeal within 48 hours of final determination notification.</li><li>The BOD will review the appeal within 7 days.</li><li>A final determination will be sent within 24 hours after BOD review.</li><li>There may only be one appeal per violation.</li></ol>
      </>
    ),
  },
  {
    id: "article-viii",
    heading: "ARTICLE VIII: MANAGEMENT PROCEDURES",
    body: (
      <>
        <h3>8.1 Responsible Parties</h3>
        <ul><li><strong>President:</strong> Primary enforcement, point tracking, and contact.</li><li><strong>BOD:</strong> Policy oversight, reviews, and appeals.</li><li><strong>All Members:</strong> Violation reports and compliance.</li></ul>
        <h3>8.2 Training and Communication</h3>
        <ul><li>The policy will be distributed to all new members.</li><li>The BOD will complete annual training.</li><li>The policy will be posted on Discord and any other communication platforms.</li><li>All updates will be communicated within 30 days.</li></ul>
      </>
    ),
  },
  {
    id: "article-ix",
    heading: "ARTICLE IX: SPECIAL PROVISIONS",
    body: (
      <>
        <p>The President or BOD may take immediate temporary action to:</p>
        <ul><li>Protect individual safety.</li><li>Prevent ongoing harassment.</li><li>Preserve evidence.</li><li>Maintain event integrity.</li></ul>
      </>
    ),
  },
  {
    id: "article-x",
    heading: "ARTICLE X: POLICY MAINTENANCE",
    body: (
      <>
        <h3>10.1 Review Schedule</h3>
        <ul><li>Annual review each August.</li><li>Emergency review upon major incident.</li></ul>
        <h3>10.2 Amendment Process</h3>
        <ul><li>All proposed changes will be sent to the President before consideration during Board meetings.</li><li>A majority vote is required for approval.</li><li>Any change will be effective 7 days after adoption.</li><li>All versions will be maintained.</li></ul>
      </>
    ),
  },
];
