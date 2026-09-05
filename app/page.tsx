import type { Metadata } from "next";

import { DonateButton } from "@/components/DonateButton";

export const metadata: Metadata = {
  // Absolute: the root layout's title.template doesn't apply to its own
  // segment in current Next.
  title: { absolute: "Commons - The Fault Foundation" },
  description:
    "The Commons Project reads Challonge, FACEIT, and start.gg into one feed. Your matches, your record, and your team's schedule live in one place.",
  alternates: { canonical: "/" },
};

/**
 * The Commons Project landing page — the front door for members. Static by
 * design (no session read, so it stays cacheable and off the Worker CPU
 * budget); the hero swaps signed-in vs signed-out CTAs with the same pre-paint
 * `data-auth` attribute the header uses (.ff-auth-when-in / .ff-auth-when-out),
 * never a per-request render. All styling is §15 of styles/theme.css.
 */

// Real product screenshots, in place of the hand-drawn feed panel this hero
// used to render in markup. A mock is cheap to keep in sync but it is also a
// drawing of the product rather than the product; these are captures of the
// live Commons Project, so the front door shows what a member actually gets.
//
// Plain <img> is the site convention (next.config.ts turns image optimization
// off), and every shot is cropped by its frame (.ff-home-shot) rather than
// pre-cropped as a file, so re-capturing one is a drop-in replacement with no
// markup change. Files live in public/screenshots/.
const SHOT_HERO = {
  src: "/screenshots/tournaments-list.jpg",
  alt: "The Commons Project tournaments tab: a featured tournament banner above a grid of tournament cards drawn from start.gg and FACEIT, each showing its art, date, entrant count and registration status.",
};

// The two supporting captures, shown side by side under the sources strip.
const SHOWCASE: { src: string; alt: string; title: string; body: string }[] = [
  {
    src: "/screenshots/tournament-detail.jpg",
    alt: "A tournament page on the Commons Project showing the advancing teams with their school logos, an About section, and a details panel listing game, dates, entrants, stream and organizer.",
    title: "Every bracket, one house style",
    body: "Brackets, standings and results render here in full \u2014 school marks and all \u2014 whichever site is actually hosting the event.",
  },
  {
    src: "/screenshots/schedule-calendar.png",
    alt: "The Commons Project schedule tab showing a month calendar with tournament chips on each day, and a Your Results panel underneath.",
    title: "One calendar, every platform",
    body: "Each account you connect folds into the same month view, with your own finished matches collected underneath it.",
  },
];

// The "Our goal" box: three divided columns, each an eyebrow + icon-left header
// + body, with an optional CTA pinned to the bottom.
const GOALS: {
  eyebrow: string;
  title: string;
  body: string;
  icon: "heart" | "code" | "layers";
  accent?: boolean;
  cta?: "donate" | "github";
}[] = [
  {
    eyebrow: "How it stays free",
    title: "Not-for-profit",
    body: "No premium tier, no ads, and we don't sell your data. As a nonprofit, donations support future development, other projects, and scholarships for students.",
    icon: "heart",
    accent: true,
    cta: "donate",
  },
  {
    eyebrow: "Community contributions",
    title: "Open-sourced",
    body: "Open-sourced for maximum transparency and to support community contributions. Want a new feature or need to report a bug? Submit a PR or issue on our GitHub.",
    icon: "code",
    cta: "github",
  },
  {
    eyebrow: "Our goal",
    title: "Unified under one",
    body: "One schedule is the goal. We want every upcoming match across every platform viewable from one source, with all matches, statistics, and rosters together.",
    icon: "layers",
  },
];

const ROADMAP: { title: string; body: string }[] = [
  {
    title: "Looking for a team",
    body: "Post your availability and let the rosters that need you come find you.",
  },
  {
    title: "Looking for players",
    body: "Captains list open slots with real match history attached to the ask.",
  },
  {
    title: "Host your own",
    body: "Create, seed, and run tournaments natively on the Commons Project.",
  },
  {
    title: "More platforms",
    body: "More sources feeding the same single feed as we add them.",
  },
];

function GoalIcon({ icon }: { icon: "heart" | "code" | "layers" }) {
  if (icon === "heart") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z" />
      </svg>
    );
  }
  if (icon === "code") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M9 18l-6-6 6-6M15 6l6 6-6 6" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3 3 7.5l9 4.5 9-4.5L12 3z" />
      <path d="M3 12l9 4.5 9-4.5" />
      <path d="M3 16.5l9 4.5 9-4.5" />
    </svg>
  );
}

export default function CommonsPage() {
  return (
    <main id="wp--skip-link--target" className="ff-main ff-main--home">
      {/* ---------- Hero ---------- */}
      <section className="ff-container ff-home-hero">
        <div className="ff-home-hero__copy">
          <h1 className="ff-home-hero__title">
            One place
            <br />
            <span className="ff-home-accent">every bracket</span>
          </h1>
          <p className="ff-home-hero__lede">
            The Commons Project reads Challonge, FACEIT, and start.gg into one
            feed, so your matches, your record, and your team&rsquo;s schedule
            live together with no tabs, no spreadsheets, and no missed
            check-ins.
          </p>

          <div className="ff-home-hero__cta ff-auth-when-out">
            <a className="ff-btn ff-btn--accent" href="/login/">
              Log in to the Commons Project
            </a>
            <a className="ff-btn ff-btn--outline" href="/signup/">
              Create an account
            </a>
          </div>
          <div className="ff-home-hero__cta ff-auth-when-in">
            <a className="ff-btn ff-btn--accent" href="/home/">
              Open the Commons Project
            </a>
            <a className="ff-btn ff-btn--outline" href="/schedule/">
              View your schedule
            </a>
          </div>

          <p className="ff-home-hero__note">Free for everyone</p>
        </div>

        <div className="ff-home-shot ff-home-shot--hero">
          <img className="ff-home-shot__img" src={SHOT_HERO.src} alt={SHOT_HERO.alt} />
        </div>
      </section>

      {/* ---------- Sources strip ---------- */}
      <section className="ff-container ff-home-sources">
        <span className="ff-home-sources__label">Reads results from</span>
        <span className="ff-home-sources__mark">Challonge</span>
        <span className="ff-home-sources__mark">FACEIT</span>
        <span className="ff-home-sources__mark">start.gg</span>
        <span className="ff-home-sources__mark ff-home-sources__mark--soon">More coming</span>
      </section>

      {/* ---------- See it in action ---------- */}
      <section className="ff-container ff-section ff-home-block">
        <h2 className="ff-home-h2">See it in action</h2>
        <div className="ff-home-shots">
          {SHOWCASE.map((shot) => (
            <figure key={shot.src} className="ff-home-shots__item">
              <div className="ff-home-shot ff-home-shot--tile">
                <img className="ff-home-shot__img" src={shot.src} alt={shot.alt} loading="lazy" />
              </div>
              <figcaption>
                <h3 className="ff-home-shots__title">{shot.title}</h3>
                <p className="ff-home-shots__body">{shot.body}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ---------- Our goal (single box, three divided columns) ---------- */}
      <section className="ff-container ff-section ff-home-block">
        <h2 className="ff-home-h2">Our goal</h2>
        <div className="ff-card ff-home-goals">
          {GOALS.map((goal) => (
            <article key={goal.title} className="ff-home-goal">
              <div className="ff-home-goal__head">
                <span
                  className={`ff-home-goal__icon${goal.accent ? " ff-home-goal__icon--accent" : ""}`}
                >
                  <GoalIcon icon={goal.icon} />
                </span>
                <div className="ff-home-goal__headings">
                  <span className="ff-home-goal__eyebrow">{goal.eyebrow}</span>
                  <h3 className="ff-home-goal__title">{goal.title}</h3>
                </div>
              </div>
              <p className="ff-home-goal__body">{goal.body}</p>
              {goal.cta === "donate" && (
                <div className="ff-home-goal__cta">
                  <DonateButton />
                </div>
              )}
              {goal.cta === "github" && (
                <div className="ff-home-goal__cta">
                  <a
                    className="ff-btn ff-btn--outline"
                    href="https://github.com/FaultFoundation/commons"
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on GitHub →
                  </a>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* ---------- Why we built this ---------- */}
      <section className="ff-container ff-section">
        <div className="ff-card ff-card--gradient ff-home-why">
          <h2 className="ff-home-why__head">Why we built this</h2>
          <div className="ff-home-why__body">
            <p>
              Every season we watched programs miss deadlines, forget matches,
              and rebuild databases with students rapidly filtering out. Every
              site hosts better and better, but tournaments are getting split
              between more and more accounts.
            </p>
            <p>
              We introduced the Commons Project to unify all tournaments into
              one view. As we expand, we hope this project will make esports
              more manageable for the largest schools to the newest teams.
            </p>
            <p className="ff-home-why__sig">
              The Fault Foundation
              <span>Gamers Supporting Students</span>
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Overfault band (coming soon) ---------- */}
      <section className="ff-container ff-section">
        <div className="ff-card ff-home-overfault">
          <div className="ff-home-overfault__copy">
            <span className="ff-home-eyebrow">
              <span className="ff-home-eyebrow__dot" />
              Coming soon
            </span>
            <h2 className="ff-home-overfault__title">Overfault Season 4</h2>
            <dl className="ff-home-overfault__meta">
              <div>
                <dt>Game</dt>
                <dd>TBD</dd>
              </div>
              <div>
                <dt>Dates</dt>
                <dd>TBD</dd>
              </div>
              <div>
                <dt>Entry</dt>
                <dd>TBD</dd>
              </div>
            </dl>
            <p className="ff-home-overfault__body">
              Details for the next Overfault season are coming soon. We&rsquo;ll
              announce everything and update this section within the week.
            </p>
          </div>
          <div className="ff-home-overfault__art" aria-hidden="true">
            <span>Coming soon</span>
          </div>
        </div>
      </section>

      {/* ---------- Roadmap ---------- */}
      <section className="ff-container ff-section ff-home-block">
        <h2 className="ff-home-h2">Roadmap</h2>
        <p className="ff-home-sub">Where the Commons Project is headed next.</p>
        <div className="ff-home-roadmap">
          {ROADMAP.map((item) => (
            <article key={item.title} className="ff-card ff-home-roadmap__card">
              <h3 className="ff-home-roadmap__title">{item.title}</h3>
              <p className="ff-home-roadmap__body">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- Program directors ---------- */}
      <section className="ff-container ff-section">
        <div className="ff-card ff-home-program">
          <div>
            <h2 className="ff-home-program__title">Run a program? Talk to us.</h2>
            <p className="ff-home-program__body">
              We&rsquo;re onboarding school programs onto the Commons Project and
              shaping the hosting tools around what they actually need.
            </p>
          </div>
          <a className="ff-btn ff-btn--outline" href="https://discord.com/invite/76D4TAdymH">
            Get in touch
          </a>
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="ff-container ff-section">
        <div className="ff-card ff-card--gradient-rev ff-home-final">
          <div>
            <h2 className="ff-home-final__title">Put the tabs away.</h2>
            <p className="ff-home-final__body">
              Sign in and connect your first platform in under a minute.
            </p>
          </div>
          <div className="ff-home-final__cta ff-auth-when-out">
            <a className="ff-btn ff-btn--accent" href="/login/">
              Log in to the Commons Project
            </a>
            <a className="ff-btn ff-btn--outline" href="/signup/">
              Create an account
            </a>
          </div>
          <div className="ff-home-final__cta ff-auth-when-in">
            <a className="ff-btn ff-btn--accent" href="/home/">
              Open the Commons Project
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
