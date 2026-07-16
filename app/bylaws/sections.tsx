import type { ReactNode } from "react";

/**
 * bylaws content, split into collapsible ARTICLE sections. Generated
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
    <h2 id="bylaws"><strong><span style={{ textDecoration: "underline" }}>Bylaws</span></strong></h2>
  </>
);

export const sections: PolicyContentSection[] = [
  {
    id: "article-i",
    heading: "ARTICLE I: NAME AND PURPOSE",
    body: (
      <>
        <h3>1.1 Name</h3>
        <p>The name of this organization shall be Fault Foundation Inc., hereafter The Fault Foundation.</p>
        <h3>1.2 Purpose</h3>
        <p>PURPOSE: The corporation is organized exclusively for charitable, educational, religious, or scientific purposes within the meaning of Section 501 (c) (3) of the Internal Revenue Code.</p>
        <p>INUREMENT OF INCOME: No part of the net earnings of the corporation shall inure to the benefit of, or be distributable to, its members, directors, officers or other private persons except that the corporation shall be authorized and empowered to pay reasonable compensation for services rendered.</p>
        <p>LEGISLATIVE OR POLITICAL ACTIVITIES: No substantial part of the activities of the corporation shall be the carrying on of propaganda or otherwise attempting to influence legislation and the incorporation shall not participate in or intervene (including the publishing or distribution of statements) in any political campaign on behalf of any candidate for public office.</p>
        <p>OPERATIONAL LIMITATIONS: Notwithstanding any other provisions of these articles, the corporation shall not carry on any other activities not permitted to be carried on (a) by a corporation exempt from Federal Income Tax under Section 501 (c) (3) of the Internal Revenue Code of 1954 (or the corresponding provision of any future United States Internal Revenue Law) or (b) by a corporation, contributions to which arc deductible under Section 170 (c) (2) of the Internal Revenue Code of 1954 (or the corresponding provision of any future United States Internal Revenue Law).</p>
        <h3>1.3 Mission</h3>
        <p>Building a future where gaming serves as a bridge for furthering education, promoting personal development, and creating community.</p>
        <h3>1.4 Mission Statement</h3>
        <p>Gamers Supporting Students.</p>
        <h3>1.4 Vision</h3>
        <p>The Fault Foundation advances gaming culture and education by creating inclusive competitive gaming opportunities; fostering community connections between gamers across diverse backgrounds; and developing educational programs that promote teamwork, strategic thinking, and digital citizenship.</p>
      </>
    ),
  },
  {
    id: "article-ii",
    heading: "ARTICLE II: MEMBERSHIP",
    body: (
      <>
        <h3>2.1 Non-Member Structure</h3>
        <p>The Fault Foundation is a non-member-based organization. Hereafter, a “member” will refer to an internal database of people who have signed the membership agreement.</p>
        <h3>2.2 Membership Eligibility</h3>
        <p>Any person may become a member of the Fault Foundation by signing the Fault Foundation Membership Agreement.</p>
        <h3>2.3 Membership Benefits</h3>
        <p>Benefits of membership include:</p>
        <ul><li>Access to the Fault Foundation Discord community and game servers.</li><li>Fault Foundation-sponsored events and tournaments.</li></ul>
      </>
    ),
  },
  {
    id: "article-iii",
    heading: "ARTICLE III: LEADERSHIP STRUCTURE",
    body: (
      <>
        <h3>3.1 Leadership Groups</h3>
        <p>Any person may hold multiple leadership positions in accordance with the Multiple Hats Policy.</p>
        <p>The groups of leadership shall include:</p>
        <ul><li>Board of Directors (BOD),</li><li>Officers,</li><li>Chairs, and</li><li>Committees.</li></ul>
        <h3>3.2 Board of Directors (BOD)</h3>
        <p>The BOD of the Fault Foundation are people legally responsible, liable, and bound to the Fault Foundation.</p>
        <p><strong>Board Positions:</strong></p>
        <ul><li>Chairperson,</li><li>Timekeeper, and</li><li>Board Members.</li></ul>
        <h3></h3>
        <h3>3.3 BOD Duties</h3>
        <p><strong>Chairperson:</strong> Responsible for the BOD’s success and shall:</p>
        <ul><li>Organize and direct all Board meetings (see Article VI, Section 2),</li><li>Ensure adequate meeting minutes are taken,</li><li>Ensure all agenda topics are discussed,</li><li>Conduct voting procedures, and</li><li>Give all Board Members a voice in each topic.</li></ul>
        <p><strong>Timekeeper:</strong> Responsible for time management and shall:</p>
        <ul><li>Ensure meetings adhere to scheduled timeframes,</li><li>Track discussion time limits,</li><li>Maintain action item deadlines,</li><li>Remind the Board of upcoming compliance dates, and</li><li>Coordinate annual review schedule for all Foundation policies and procedures.</li></ul>
        <p><strong>Board Members:</strong> Responsible for governance and shall:</p>
        <ul><li>Attend all Board meetings,</li><li>Review and vote on proposals,</li><li>Provide oversight of Officers and operations,</li><li>Ensure compliance with nonprofit regulations, and</li><li>Represent the Foundation’s best interests in all decisions.</li></ul>
        <h3>3.4 BOD Attendance Requirements</h3>
        <p>The BOD may miss or be late to 2 Board meetings each quarter before being considered for removal.</p>
        <h3>3.5 Officers</h3>
        <p>The Officers of the Fault Foundation are responsible for administrative tasks and shall report to the BOD.</p>
        <p><strong>Officer Positions:</strong></p>
        <ul><li>President,</li><li>Treasurer,</li><li>Secretary,</li><li>Vice President of Esports, and</li><li>Vice President of Community Engagement.</li></ul>
        <h3>3.6 Officer Duties</h3>
        <p><strong>President:</strong> Oversees daily operations and shall:</p>
        <ul><li>Implement Board decisions,</li><li>Manage Officer team coordination,</li><li>Serve as primary spokesperson for the Foundation,</li><li>Maintain relationships with partners and sponsors, and</li><li>Ensure organizational compliance with all policies.</li><li>Maintain access to bank account for periodic review.</li></ul>
        <p><strong>Treasurer:</strong> Manages financial operations and shall:</p>
        <ul><li>Maintain accurate financial records,</li><li>Prepare and present financial reports to the Board,</li><li>Manage budgets and financial planning,</li><li>Ensure compliance with IRS requirements,</li><li>Oversee fundraising activities, and</li><li>Maintain access to bank account, collect.</li></ul>
        <p><strong>Secretary:</strong> Manages documentation and shall:</p>
        <ul><li>Ensure meetings minutes are recorded for all meetings,</li><li>Manage organizational records and documentation, and</li><li>Ensure compliance with state filing requirements.</li></ul>
        <p><strong>Vice President of Esports:</strong> Oversees competitive gaming and shall:</p>
        <ul><li>Manage all competitive gaming activities,</li><li>Coordinate with game-specific Chairs and Committees,</li><li>Develop competitive programming, and</li><li>Ensure fair play standards.</li></ul>
        <p><strong>Vice President of Community Engagement:</strong> Manages community relations and shall:</p>
        <ul><li>Manage Discord and online community platforms,</li><li>Develop community programs and events,</li><li>Oversee member engagement initiatives,</li><li>Coordinate volunteer activities,</li><li>Manage social media presence, and</li><li>Foster inclusive community culture.</li></ul>
        <h3>3.7 Chairs</h3>
        <p>Chairs are responsible for specific aspects of the organization such as specific games, communities, or teams.</p>
        <p><strong>Chair Documentation:</strong> The following shall be defined in each Chair’s Chair Responsibilities document:</p>
        <ul><li>Name and title,</li><li>Responsibilities,</li><li>Qualifications,</li><li>Election procedures,</li><li>Term-end/renewal date, and</li><li>Reporting requirements.</li></ul>
        <p><strong>Chair Creation:</strong> Chair positions may be proposed by any Board member and approved with a 2/3 majority vote.</p>
        <p><strong>Chair Elections:</strong> Chair elections shall be approved with a 1/2 majority vote.</p>
        <h3>3.8 Committees</h3>
        <p>Committees are groups responsible for specific aspects of the organization such as tournament organization and complex projects.</p>
        <p><strong>Committee Documentation:</strong> The following shall be defined in each Committee’s Committee Responsibilities document:</p>
        <ul><li>Name,</li><li>Responsibilities,</li><li>Qualifications,</li><li>Election procedures, and</li><li>Reporting requirements.</li></ul>
        <p><strong>Committee Creation:</strong> Committees may be proposed by any Board member and approved with a 2/3 majority vote.</p>
        <p><strong>Committee Elections:</strong> Committee elections shall be approved with a 1/2 majority vote.</p>
        <h3>3.9 Disciplinary Procedures</h3>
        <p>All leadership position disciplinary policies are included in the Disciplinary Policy document.</p>
        <h3>3.10 Election Procedures</h3>
        <p>Any individual may be considered for nomination and election for any position. Elections will be approved with a 1/2 majority vote by the BOD.</p>
      </>
    ),
  },
  {
    id: "article-iv",
    heading: "ARTICLE IV: DECLARED ABSENCE AND REMOVAL",
    body: (
      <>
        <h3>4.1 Declared Absence Initiation</h3>
        <p>Declared Absence shall occur when:</p>
        <ul><li>A leadership member declares it to the BOD Chairperson.</li><li>The BOD, excluding the individual declaring absence, votes with a 3/4 majority.</li></ul>
        <h3>4.2 Declared Absence Status</h3>
        <p>An Officer on declared absence shall:</p>
        <ul><li>Hold the responsibilities of a member</li><li>Retain their Officer title for the remainder of the term</li><li>Have title removed if a special election for the position is held</li></ul>
        <h3>4.3 Duty Delegation</h3>
        <p>When an Officer is placed on declared absence, the President shall delegate the individual’s duties to other individuals. If the President is placed on declared absence, the BOD shall elect a temporary President with a 1/2 majority vote.</p>
        <h3>4.4 Declared Absence Removal</h3>
        <p>Declared absence shall be removed with a unanimous BOD vote.</p>
        <h3>4.5 Communication Requirements</h3>
        <p>Declared absence and removal of declared absence shall be announced via email to all members of the Fault Foundation.</p>
        <h3>4.6 Position Removal</h3>
        <p>Any individual may be removed from their leadership position with a unanimous BOD vote.</p>
      </>
    ),
  },
  {
    id: "article-v",
    heading: "ARTICLE V: AMENDMENTS",
    body: (
      <>
        <h3>5.1 Amendment Proposal</h3>
        <p>Amendments and proposals may be drafted and proposed by any member of the Fault Foundation.</p>
        <h3>5.2 Amendment Approval Process</h3>
        <ol><li>Drafted amendments will be sent to all Board members at least 3 days before voting.</li><li>Amendments are approved via 2/3 majority vote among all voting members of the BOD.</li><li>Approved amendments effective 3 days after approval unless otherwise specified.</li></ol>
        <h3>5.2 Annual Review</h3>
        <p>The Fault Foundation bylaws shall be reviewed Every January by the BOD and updated as necessary to reflect organizational growth and compliance requirements.</p>
      </>
    ),
  },
  {
    id: "article-vi",
    heading: "ARTICLE VI: DISSOLUTION",
    body: (
      <>
        <p>DISSOLUTION CLAUSE: Upon the dissolution of the corporation, the Board of Directors shall, after paying or making provisions for the payment of all of the liabilities of the corporation, dispose of all the assets of the corporation exclusively for the purposes of the corporation in such manner, or to such organization or organizations organized and operated exclusively for charitable, educational, religious, or scientific purposes as shall at the time qualify as an exempt organization or organizations under Section 501 (c) (3) of the Internal Revenue Code of 1954 (or the corresponding provision of any future United States Internal Revenue Law), as the Board of Directors shall determine. </p>
        <p>Any such assets not so disposed of shall be disposed of by the Circuit Court of the county in which the principal office of the corporation is then located, exclusively for such purposes or to such organization or organizations, as said Court shall determine, which are organized and operated exclusively for such purposes.</p>
      </>
    ),
  },
];
