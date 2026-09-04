# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The Commons — the member-facing side of The Fault Foundation. Next.js 15 (App
Router) running **on Cloudflare Workers** via `@opennextjs/cloudflare`, with
Cloudflare D1 + Drizzle and Better Auth. Ships to `commons.fault.foundation` as
the `commons` Worker. The public marketing site is a separate repo and a
separate Worker (`website`) — never deploy this repo under that name.

Existing docs are detailed and current; read them before changing the areas they
cover rather than re-deriving:

- [README.md](README.md) — stack, file map, deploy
- [docs/dashboard-guide.md](docs/dashboard-guide.md) — **the portal's UI
  conventions and backend rules**; the single most useful file before touching
  anything under `app/` or `components/dashboard/`
- [db/README.md](db/README.md) — full data model, table-by-table
- [docs/cloudflare-setup.md](docs/cloudflare-setup.md), [docs/oauth-setup.md](docs/oauth-setup.md) — account-side setup

## Keeping the docs current

**Documentation updates are part of the change, not a follow-up.** Any change
that alters what these files describe must update them in the same piece of
work:

- **This file** — whenever a command, an architectural rule, a trust boundary,
  or a convention changes. If you had to read three files to work something out,
  that's the kind of thing that belongs here.
- **[db/README.md](db/README.md)** — whenever `db/schema.ts` changes. A new
  table, column, index, or status value means updating the data model there:
  the feature→schema mapping, the relational form, and the Mermaid graphs are
  all hand-maintained and go stale silently. A migration in `drizzle/` with no
  matching README edit is an incomplete change.
- The **existing** docs in [docs/](docs/) and [README.md](README.md) — portal
  conventions belong in `docs/dashboard-guide.md`, account/provider setup in
  `docs/cloudflare-setup.md` / `docs/oauth-setup.md`, stack and file map in the
  root README.

**Do not create new README or doc files.** There is one root README, one
database README, and the `docs/` folder — that is the whole documentation
surface. A new `README.md` in a component or lib folder fragments the docs and
guarantees drift; put the explanation in the file that already owns the topic,
or in a comment next to the code. Add a file to `docs/` only when a genuinely
new subsystem appears, and link it from the list above.

Docs here carry *reasoning*, not just description — the "why" behind a
constraint is what stops it being undone later. Match that when editing, and
correct anything you find that has already drifted rather than working around it.

## Commands

```sh
npm run dev             # Next dev server on :3000 (local D1 via initOpenNextCloudflareForDev)
npm run preview         # OpenNext build + real workerd runtime on :3999
npm run build           # OpenNext build (what Workers Builds runs)
npm run deploy          # build + deploy the commons Worker
npx tsc --noEmit        # the typecheck — run this after any change
npm run cf-typegen      # regenerate cloudflare-env.d.ts after editing wrangler.jsonc/.dev.vars
```

**There is no test suite and no working linter.** `npm run lint` runs the
deprecated `next lint`, and ESLint isn't installed — it drops into an
interactive "configure ESLint?" prompt and fails. Verification is
`npx tsc --noEmit` + `npm run build`, then exercising the change on :3000 or
:3999. The `/verify` skill (`.claude/skills/verify/SKILL.md`) describes how to
drive the app locally; Playwright is not a project dependency.

Database:

```sh
npm run db:generate       # db/schema.ts change -> new SQL file in drizzle/
npm run db:migrate:local  # apply to local D1 (.wrangler/state)
npm run db:migrate:remote # apply to real D1 — run BEFORE npm run deploy
npm run db:cen:generate   # db/cen-schema.ts -> migration in drizzle-cen/
npm run db:cen:seed:favicons:local / :remote
                          # load the Hipo-backed + curated school favicon/university lookup into cen-sql
npm run db:ow:generate    # db/ow-schema.ts -> migration in drizzle-ow/ (also
                          # db:ow:migrate:local / :remote). The Commons owns the
                          # ow-player-data schema; the ow-data repo only
                          # reads/writes rows.
npm run db:import:legacy -- --input temp/legacy-bot-data.json [--apply]
                          # normalized legacy bot import; local only, backs up first
npm run staff:seed        # bootstrap the first staff owner (--email / --discord, --remote)
wrangler d1 execute website-sql --local --command "SELECT …"   # inspect
```

Migrations are **generated** by drizzle-kit and **applied by wrangler**
(`migrations_dir` in wrangler.jsonc points at `drizzle/`). Seeding, resets, and
the bootstrap registry rows are in [db/README.md](db/README.md) — which is also
the file to update in the same commit as any `db/generate` run (see above).

## Runtime model — the constraint behind most of the code

Cloudflare bindings (`DB`, `CEN`, `OW`, `AVATARS`) and secrets only exist on the
**request** context. Nothing that touches them may be built at module scope:

- `getDb()` ([lib/db.ts](lib/db.ts)) and `getAuth()` ([lib/auth.ts](lib/auth.ts))
  construct fresh per request, off `getCloudflareContext()`. Both use React
  `cache()` so repeated callers in one request share the stateless wrapper;
  never hoist either into a module-level constant or add cross-request caching.
- Per-request work that several components repeat is memoized with React
  `cache` instead — `getSessionCached` ([lib/session.ts](lib/session.ts)),
  `getStaffRoles` ([lib/staff.ts](lib/staff.ts)). The Worker's CPU budget is
  real; rebuilding the Better Auth instance per component was a measurable cost.
  `getAuth()` itself is now wrapped in React `cache` for the same reason, so the
  several callers in one render share one construction. **Read the session with
  `getSessionCached()`, never `getAuth().api.getSession()`** in a page/component —
  a page that reads it directly re-validates the session a second time on top of
  the shell's read. Better Auth's signed cookie cache keeps repeat validations
  off D1 for 60 seconds; that cache is only identity/session convenience, never
  a substitute for the D1-backed staff capability checks or admin unlock gate.
- **CPU budget still matters, but we're on Workers _Paid_ now.** Paid raises the
  CPU ceiling to **30 s/request** (from Free's 10 ms) and removes the
  100k-requests/day cap, so the old "Error 1102 — Worker exceeded resource limits"
  when clicking between tabs should no longer occur. The discipline that fixed it
  stays worth keeping — memoize per-request work, don't rebuild auth, prefer
  client-side work — because CPU is billed and a runaway render is now a cost, not
  just a cap. Paid also unlocks Cron Triggers, but the Commons OpenNext Worker
  still hosts no `scheduled` handler (see below); scheduled work lives in separate
  Workers (`cen-scraper`, `ow-data`).
- Session-gated pages set `export const dynamic = "force-dynamic"`.
- **D1 has no interactive transactions.** Drizzle's `transaction()` emits `BEGIN`,
  which D1 rejects — use `db.batch([...])` for writes that must land together.
- Wrangler D1 also rejects `CREATE TEMP TABLE` with `SQLITE_AUTH`. One-shot
  scripts that need a fail-closed guard must use a uniquely named normal table
  and drop it in the same file, as the legacy bot importer does.
- There is no `scheduled` handler in this Worker: OpenNext generates
  `.open-next/worker.js`, so cron work has nowhere to hang without a wrapper.
  Cron Triggers are available (we're on Paid), but the deliberate pattern is to
  keep scheduled work in **separate** Workers (`cen-scraper`, `ow-data`)
  and read what they write. In-Worker refresh is done lazily on read (see the TTL
  in [lib/integrations.ts](lib/integrations.ts)).
- Node built-ins are limited to `nodejs_compat`. SMTP is hand-rolled on
  `node:tls` ([lib/smtp.ts](lib/smtp.ts)) because esbuild can't resolve
  `cloudflare:sockets` during the OpenNext bundle.
- Trailing slashes: `trailingSlash: true` + `skipTrailingSlashRedirect`, with
  the redirect done in [middleware.ts](middleware.ts) so `/api/*` is exempt
  (Better Auth's router 404s trailing-slash API URLs). If auth breaks on :3000,
  check those two files first.

## Architecture

### Schema layering (`db/schema.ts`)

A stable **identity core** (Better Auth's `user`/`session`/`account`/
`verification`, which own their shapes) with everything else hanging off
`user.id` as satellites. The extension rule that shapes the whole schema: a new
initiative adds one `programs` row and one `<program>_details` table FK'd 1:1 to
`program_memberships` — the identity core is never touched. Cross-cutting
concerns (`platform_identities`, `staff_roles`, `moderation_actions`) extend by
row, not by column. Layer comments in the file mark the tiers.

### The `*-shared.ts` convention

`lib/teams-shared.ts`, `staff-shared.ts`, `tickets-shared.ts`,
`registration-shared.ts`, `lfg-shared.ts`, `integrations-shared.ts` are
importable from **client**
components: they must stay free of server-only imports (db, cloudflare context).
Constants, enums, labels, and pure validators live there; the server-only
counterpart (`teams.ts`, `staff.ts`, `tickets.ts`) does the D1 work.

### The Home board is made of the site's real bubbles

`/home/` is a board the member arranges, and the tiles on it are **the portal's
own bubbles, not condensed copies**. Two rules hold it together:

- **The panel contract.** A pinnable bubble renders its OWN `Bubble` and takes a
  `chrome` prop — the host's bubble-level props
  ([components/dashboard/bubbles/PanelChrome.tsx](components/dashboard/bubbles/PanelChrome.tsx),
  merged with `mergeChrome`). Its tab renders it bare; the Home board renders the
  identical component with the span, drag grip and reorder buttons supplied. So
  there is one copy of the markup, and a change to a tab's card lands on Home for
  free. Panels live beside their tab (`AccountPanels.tsx`, `CalendarPanel` /
  `ResultsPanel` in `ScheduleView.tsx`, `TournamentsPanel`, `TeamsPanel`,
  `OverwatchPanel`, `MatchPanel`).
- **The row rhythm.** The board alternates one full-width row with a two-column
  row (`isFullWidthAt` in [lib/home-shared.ts](lib/home-shared.ts): full when
  `index % 3 === 0`, plus a trailing lone tile that stretches). **Position
  decides width, not the panel** — which is why chrome's `span` overrides the
  panel's own preference.

[lib/home-shared.ts](lib/home-shared.ts) is the registry (every pinnable bubble,
its customize-popup `group`, and the `sources` it needs);
[components/dashboard/home/HomeWidgets.tsx](components/dashboard/home/HomeWidgets.tsx)
maps an id to the real panel; [lib/home.ts](lib/home.ts) loads **only the sources
the enabled widgets declare** — the board can hold any bubble on the site, so
fetching every tab's data up front is no longer affordable. `HomeBoard` is a
CLIENT component, so a panel must be client-bundle-safe: that is why
`discordServerNote` sits in `integrations-shared.ts`, not `integrations.ts`.

Adding a bubble a member should be able to pin means: make it a panel, add a
`HOME_WIDGETS` entry, load its source in `lib/home.ts`, render it in
`HomeWidgets.tsx`. See [docs/dashboard-guide.md](docs/dashboard-guide.md).

### Two parallel capability models

Team permissions in [lib/teams-shared.ts](lib/teams-shared.ts) (`manager |
captain | coach | player`) and site-wide staff permissions in
[lib/staff-shared.ts](lib/staff-shared.ts) (`owner | admin | moderator |
tournament_admin`). Both work the same way, and the rule is the same in both:

**Never compare a role name inline** (`role === "admin"`). Gate on
`can(role, capability)` / `canAny(roles, capability)`. A new capability is an
entry in the capability map plus the action and the UI that honor it. Server
actions open by re-deriving authorization from D1
(`requireTeamCapability` / `requireStaffCapability`) — a client that forges its
way to a view still cannot read or mutate.

### The admin gate is three layers

[components/dashboard/admin/AdminGate.tsx](components/dashboard/admin/AdminGate.tsx)
wraps every admin page: authenticated → holds a staff capability (re-read from
D1) → **re-verified with 2FA in the last 15 minutes**. That last layer is a
signed cookie bound to the user id ([lib/admin-unlock.ts](lib/admin-unlock.ts)),
deliberately separate from the Better Auth session. Every admin server action
re-checks all three; admin JSON endpoints under `app/api/admin/*` use
`requireStaffApi` ([lib/admin-api.ts](lib/admin-api.ts)) for the identical gate.
Discord staff roles are synced into `staff_roles` (`granted_via = "discord"`) on
entry/unlock, mapped by the `DISCORD_STAFF_ROLE_MAP` env var.

**Every failure redirects; the gate never renders a page in place.** Not signed
in → `/login/`. Not staff → `/home/`, with no prompt at all, because offering to
verify would confirm there is an admin area to unlock. Staff without a current
unlock → `/home/?unlock=1&next=<the admin URL>`, where
[DashboardNav](components/dashboard/DashboardNav.tsx) opens the 2FA step-up as a
modal ([AdminUnlockDialog](components/dashboard/admin/AdminUnlockDialog.tsx)),
scrubs the query, and on success resumes `next` (re-sanitized with
`sanitizeNextPath`). The rail opens the same dialog when the Admin group is
clicked, *before* sliding across — `DashboardShell` passes `adminLocked`, which
is a cookie read with no D1 cost. That flag is UX only; the boundary is still
AdminGate plus `requireAdminUnlock` inside every privileged action.

Two things are load-bearing in that flow. `AdminGate` learns its own URL from
the `x-ff-pathname` request header set in [middleware.ts](middleware.ts) —
server components can't see their URL, and threading a prop through every admin
page is something the next new admin page would forget. And the dialog fetches
its 2FA details (`getUnlockPrompt`) only when it *opens*, never from the shell:
`DashboardShell` renders on every portal page, and the 2FA row read there would
be a per-page D1 query for staff who are already unlocked.

### Tournaments run on Challonge

The tournament backend is **Challonge (API v2.1)**, not a self-hosted bracket
engine — Challonge owns bracket generation, seeding, match progression and
standings, and the Commons is a **branded front-end** over it. (An earlier
self-hosted engine — `lib/brackets*.ts`, `lib/scoring.ts`, `stages`/`matches`/
`match_games` — was removed when we moved to Challonge; don't reintroduce that
shape.)

- **[lib/challonge.ts](lib/challonge.ts) is the only module that talks to
  Challonge.** It authenticates with the org account's **personal API key**
  (`CHALLONGE_API_V1_KEY`), sent as `Authorization-Type: v1` against the v2.1
  base URL — the key is a *credential type*, not the deprecated v1 API. v2.1
  speaks JSON:API, so the client wraps/unwraps the `{ data: { type, attributes } }`
  envelope. Server-only. **Degrades**: unset key → admin actions return "not
  configured" and public pages render an empty bracket, never a 500. This is
  distinct from the member `CHALLONGE_CLIENT_*` OAuth (a profile read used only
  to link a member's entry to their Challonge account).
- **The snapshot seam.** [lib/tournaments.ts](lib/tournaments.ts) pulls Challonge
  participants+matches into a `SnapshotPayload` (defined in
  [lib/tournaments-shared.ts](lib/tournaments-shared.ts)), cached as one JSON row
  in `tournament_brackets`. `BracketView` and the poll route
  (`app/api/tournaments/[id]/bracket`) consume that shape and never touch
  Challonge — the cache decouples viewer count from Challonge's metered API. It
  refreshes **lazily on read** past a status-scaled TTL (`SNAPSHOT_TTL_MS`):
  **10 min while seeding/active** so opening a live bracket shows a recent state
  even for results entered straight on Challonge, 30 min during registration,
  12 h for a draft, 30 days for an archive (Workers has no cron). It also rebuilds
  **immediately** after any admin mutation (which bumps `tournaments.version`;
  `getOrRefreshSnapshot` rebuilds when the cache is behind that version). Because
  it's one shared cached row, the active TTL is at most one refresh per window no
  matter how many people watch. The poll route short-circuits unchanged polls on
  the ETag, so the only paths that actually re-hit Challonge are a page open past
  the TTL and an admin write.
- **Provider metadata reconciles once daily on list access.** One paginated org
  tournament read refreshes names, formats, descriptions, start times, URLs and
  lifecycle states for every linked D1 row. `provider_synced_at` is the global
  lazy-sync lease, so traffic cannot multiply API calls. A linked D1 row absent
  from the complete Challonge listing is deleted locally; an API or pagination
  failure never deletes anything.
- **Admin lifecycle → Challonge.** Our status
  (`draft→registration→seeding→active→completed`) is richer than Challonge's;
  the mapping lives in [app/admin/tournaments/actions.ts](app/admin/tournaments/actions.ts):
  Start = `change_state("start")`, Complete = `finalize`, reset = `reset`. Every
  action re-derives the `manageTournaments` staff capability + admin unlock, same
  three-layer gate as every other admin surface.
- **Registration is teams-only** today (the schema keeps solo a migration-free
  future). Entering adds a Challonge participant named for the team, passing the
  registering captain's connected Challonge handle when present so the event also
  lands in their Challonge history. Results are entered staff-side; captain
  self-reporting is deferred.

The public bracket is at `/t/<id>/<name>/` (not `/tournaments/[…]` — `robots.ts`
disallows that prefix); the id is the whole lookup and the name segment is
cosmetic, re-derived from `name` so a rename never orphans a link.

### The tabbed tournament view (both internal and external)

The internal `/tournaments/[id]` page and the external
[ExternalTournamentView](components/dashboard/tournaments/ExternalTournamentView.tsx)
render through **one shared client shell**,
[TournamentChrome](components/dashboard/tournaments/TournamentChrome.tsx), so a
Challonge-backed and a scraped tournament look identical. A hero header (banner
behind the **title only**, stopping below it — the deliberate brand treatment,
not a full-height hero) stays visible; under it, browser-style in-page tabs
**Overview / Bracket / Standings / Rules** show one panel at a time. Only the
active panel is mounted, so the polling `BracketView` and the measured
`ExternalBracket` do no work while hidden. A small React context
(`useTournamentTabs`) lets a control deep in a panel switch tabs — that's how
"Full standings →" on the Overview jumps to the Standings tab. Tabs honour a
`?tab=` deep link on mount but keep no server state; `BracketView` takes
`showBracket`/`showStandings` so the Bracket and Standings tabs each mount it
with one half (shared snapshot, one instance live at a time).

- **Overview** leads with a **Top Finishers** row —
  [TopFinishers](components/dashboard/tournaments/TopFinishers.tsx) with
  gold/silver/bronze [TrophyIcon](components/dashboard/tournaments/TrophyIcon.tsx)
  marks (inline SVG, no image assets) — then About + a Details facts panel
  (external) or the Participants grid (internal). On the **external** view the
  Details rail also carries the **Recent Results** card beneath the facts:
  [TournamentOverview](components/dashboard/tournaments/TournamentOverview.tsx)
  (client) ResizeObserves the About and Details bubbles and caps the card's
  `max-height` so Details + card stops at the About bubble's bottom, its list
  scrolling inside (CSS can't — a grid `stretch` sizes to the TALLER child). "Show
  all N matches" opens `RecentResultsPopup` (the shared `ff-daypop` overlay, a
  grid of every scoreboard card) rather than expanding the rail past About.
- **Recent Results** ([RecentResults](components/dashboard/tournaments/RecentResults.tsx))
  is a controlled presentational card — broadcast-style scoreboard cards (on the
  same surface + shadow as a tournament list card: header round + date/time
  ("Sep 4, 2026, @ 5:00 pm EST", server-rendered in the org's ET zone so the
  labelled clock time isn't a bare Worker-UTC one) over a hairline, a "Final"
  status, the two entrants with scores and, only when they have one, a logo;
  latest decided matches, finals first). The host caps its height and supplies the
  footer button, so the same card serves the external Overview rail (button → the
  popup) and the **internal** Bracket tab, where it stays a **sidebar**
  ([BracketWithSidebar](components/dashboard/tournaments/BracketWithSidebar.tsx)
  measures the bracket bubble and caps the card to it; the internal Overview has
  no Details rail to host the card, so it keeps the sidebar and its in-place
  "Show fewer"/"Show all" expand). The external Bracket tab is therefore just the
  bracket, full width.
- Both views carry the **same header share affordance** — the
  [ShareBar](components/dashboard/tournaments/ShareBar.tsx) (the external branch
  is passed a Commons `shareUrl`). An earlier per-tournament "known links" icon
  row was dropped in favour of this consistency; the tournament's own
  links (stream/Discord/organizer/socials) still live in the Overview Details
  panel.
- The start.gg **About section headers** ("Format" / "Prizing" — start.gg's
  `widgetTitle`) are carried on each `AboutRow.title` and rendered by
  [AboutLayout](components/dashboard/tournaments/AboutLayout.tsx). The scraper
  reads them from the layout API's `widget.config.title`, taken only from a
  CONTENT widget (Markdown/Image/Video — never a dropped view widget like the
  Events/Rules/Prizing overviews, whose titles would leak) and only when
  `config.showTitle` isn't false — verified against the live
  `profileWidgetPageLayout`. A Markdown section with no title (e.g. the CRL,
  which puts `# Welcome…` headings in the body) simply has none; the header only
  appears for tournaments whose organizer titled the markdown sections. Existing
  `about_layout` rows predate this and read `title: null` until re-scraped.
- **Small entrant marks everywhere.** 18–22px favicons/logos sit beside team
  names in the bracket slots, standings, top finishers and recent results.
  External favicons come from cen-sql (`ext_matches.entrant_{1,2}_logo_url`,
  `ext_standings.entrant_logo_url` — Google s2 favicons the scraper resolves via
  `school_favicons`); their canonical school name/domain is carried separately
  as `entrant_*_school_name`/`entrant_*_school_domain`. Internal marks are the
  team `logoUrl`, now carried through the bracket snapshot (`SnapshotParticipant.logoUrl`, joined by
  `challonge_participant_id` in `getOrRefreshSnapshot`; snapshots cached before
  this field read as null). The shared shapes/components live in
  [tournament-view-shared.ts](components/dashboard/tournaments/tournament-view-shared.ts).
- **Standings/finishers for external fall back to the bracket.** The scraper
  lands many bracket tournaments with matches but an empty `ext_standings`, which
  left the Standings tab and top-finishers blank. start.gg events with no
  published standings instead project their `event.entrants` roster into
  `ext_standings` with null placements; the tab is then labelled **Entrants**.
  When no placed standings exist, `deriveBracketResults` (in
  `ExternalTournamentView`) reconstructs placements from a **completed** bracket:
  champion + runner-up from the highest winners-side match, the rest by
  elimination stage (later losers-bracket exit places higher), ties shared. It is
  **pool-aware** — it splits into pools EXACTLY the way `ExternalBracket` does
  (prefer `phaseGroupId`, else the weakly-connected components of the feed graph,
  so a CRL-style A1–A4 qualifier with prereq edges but no phase-group labels
  still splits into 4) and ranks each pool on its own. A single bracket shows a
  podium (top-3); a pool stage shows the **advancing** entrants — each pool's
  top-`POOL_ADVANCE_DEFAULT` (1 until the scraper collects start.gg's real
  progression count), labelled and sorted by pool, both in the Overview finishers
  row and as per-pool sections (with an "Advancing" tag) in the Standings tab.
- **Pool inference needs a feed graph to exist.** Both `ExternalBracket` and
  `deriveBracketResults` infer pools as weakly-connected components ONLY when the
  set actually has an internal prereq edge (`hasFeedGraph`). Without one — FACEIT
  ships no prereqs, and a start.gg bracket scraped before its sets carry them —
  every match is its own singleton component, which would render one bogus "Pool"
  tab (and one derived pool) PER MATCH. So a phase with no feed graph stays a
  single bracket / single ranking. This is why an ordinary FACEIT event shows one
  bracket, not N pools.
- **The external Standings tab is a grouped-tie table.**
  [StandingsTable](components/dashboard/tournaments/StandingsTable.tsx) (shared by
  the placed, derived-single and derived-pool paths) renders **ordinal** ranks and
  collapses **ties into one range cell** — the four entrants sharing 5th place
  become a single "5th – 8th" cell spanning their rows (a `rowSpan`; range end =
  `place + tieSize − 1`, standard competition ranking). Every entrant carries a
  circular avatar — its favicon/logo, or a neutral person placeholder when it has
  none. (The **internal** Standings still renders through `BracketView`'s own
  W–L/Pts table, which is richer for the team-based Challonge events; it wasn't
  folded into this.)

**Liquipedia portability (structure only).**
[lib/liquipedia.ts](lib/liquipedia.ts) maps a tournament onto Liquipedia's
`{{Infobox league}}` parameter names and records every param we **can't** fill
(`LIQUIPEDIA_UNMAPPED` + a per-tournament `missing[]`) — the "note any missing
fields" checklist for a future porting project. It is pure and **unwired**: no
page, endpoint, or export UI imports it yet. The wikitext emitter and its
surface get built on top of this later.

### Esports connects and the personal schedule

Members link **FACEIT / start.gg / Challonge** as connect-only OAuth (never a
sign-in: `disableSignUp`) alongside Discord/Battle.net. The configs live in
[lib/auth.ts](lib/auth.ts) (`genericOAuth`), the profile fetchers and the
`platform_identities` mirror in [lib/platform-identities.ts](lib/platform-identities.ts),
the client-safe registry in [lib/integrations-shared.ts](lib/integrations-shared.ts).
Each card degrades to disabled when its OAuth secrets are unset. This member
`CHALLONGE_CLIENT_*` OAuth is distinct from the org `CHALLONGE_API_V1_KEY` that
runs the tournament backend (above).

For a linked FACEIT/start.gg account, `loadConnectIntegrations`
([lib/integrations.ts](lib/integrations.ts)) also **tests public reachability**:
it reads the member back through the server key by their stored external id (the
same path the schedule sync uses), lazily past a 30-min TTL cached in
`platform_identities.metadata`. Only a *definitive* negative from a successful
call flags the account as private — the card then shows a "set your profile to
public to sync" hint — so an outage/timeout/missing key stays `null` (no hint)
and never cries wolf. Challonge is read via the member's own OAuth token, so it
has no such check. The Integrations bubble has a reload control
(`recheckConnections` → `recheckConnectHealth`) that forces a fresh test past
the TTL on demand.

`/schedule` is the payoff: [lib/schedule.ts](lib/schedule.ts) pulls each
connected member's matches/tournaments into `external_matches` and the page
renders them as one calendar. Same Workers-shaped constraints as everything
else — **no cron, so it syncs lazily on read** past a 15-min per-provider TTL
(stamped in `platform_identities.metadata`), every provider call is best-effort
(4s timeout, never throws, `[]` on failure), and writes go through `db.batch`.
Provider auth differs: FACEIT and start.gg read **server-side keys**
(`FACEIT_API_KEY`, `STARTGG_API_KEY`) keyed by the member's stored external id —
no per-member OAuth token — while Challonge uses the member's OAuth token
(`Authorization-Type: v2`, the act-on-behalf path, vs the org key's `v1`) because
it has no server-side "this member's tournaments" read. OAuth still runs the
*connect* (capturing the external id); the server keys do the data reads.
Live-verified for Challonge only; the FACEIT/start.gg adapters are written
against documented shapes and parse defensively pending a live key.

### External tournaments — the second D1 (`cen-sql`)

The Tournaments tab unifies **internal** Challonge-backed tournaments (in
`website-sql`) with **external** ones scraped from start.gg/FACEIT. The external
data lives in a **separate D1 database, `cen-sql`**, bound read-only to the
Commons as `CEN` — deliberately not joined to `website-sql` at the DB level
(D1 can't JOIN across bindings; join in app code by external id, like the bot's
Sheets↔D1 split). It is a lean **projection** ([db/cen-schema.ts](db/cen-schema.ts):
`ext_tournaments`/`ext_events`/`ext_matches`/`ext_standings`), not the scraper's full
normalized model.

**The live cen-sql schema is owned by the SCRAPER, not this repo.** Production
cen-sql is migrated by `cen-news-notifications/migrations/` (its
`db:migrate:remote`, latest `0013_entrant_school_identity`); the Commons
`drizzle-cen/` (`npm run db:cen:*`) is a **read-side mirror** — it shapes the
LOCAL dev DB and lets the Drizzle schema in `db/cen-schema.ts` typecheck, nothing
more. The two histories share only `0000`/`0001` then diverge, so **never run
`npm run db:cen:migrate:remote` against production** — it would replay the Commons
history onto prod (whose `d1_migrations` has none of those names) and collide with
columns that already exist. Verify with `wrangler d1 execute cen-sql --remote
--command "SELECT name FROM d1_migrations"` (prod shows the scraper's names;
`--local` shows the Commons names — they are NOT the same DB state). A NEW cen-sql
column therefore goes in the **scraper's** `migrations/` + is added to
`db/cen-schema.ts` here only to READ it (with a matching drizzle-cen migration for
local dev).

- **The Commons app never writes `cen-sql`.** The writer and all scraping APIs
  live in the separate `cen-news-notifications` repository, whose plain
  TypeScript Worker deploys independently as `cen-scraper` and owns the hourly
  UTC Cron Trigger. Keep this boundary strict: the Commons OpenNext Worker must
  not import provider scraping code or host `scheduled`. `scripts/cen-project.mjs`
  + `cen-seed.sql` remain a local/emergency compatibility import only.
- **Reads degrade** ([lib/external-tournaments.ts](lib/external-tournaments.ts),
  over [lib/cen-db.ts](lib/cen-db.ts) `getCenDb()`): no `CEN` binding, an
  empty table, or a query error returns nothing, so the tab renders the internal
  tournaments alone. Tournament `status` is **derived**, never written: terminal
  event states first, then the end date, then a 30-day fallback only when the
  provider omitted an end date. This keeps stale rows out of Active without
  mutating the scraper's source data. List enrichment reads the indexed event
  projection and grouped match timestamps directly; never expand the full
  tournament catalog into a D1 `IN (...)` clause, which exceeds D1's bind limit
  as the scraper projection grows and causes the degraded empty-list fallback.
- The 30-day derived fallback applies to **external scraped tournaments only**.
  Native Challonge lifecycle comes from explicit provider state during the
  daily metadata reconciliation; its snapshot `fetchedAt` is cache freshness,
  not evidence that a match happened. Never guess lifecycle from fetch time or
  parse every bracket payload on the list path.
- The list ([app/tournaments/page.tsx](app/tournaments/page.tsx)) merges both
  into one `TournamentListEntry[]`; external cards carry a `source`, show the
  scraped `banner_url`, and link **into** the branded Commons view (not out).
  Their ids carry a `source:` prefix, so the card links percent-encode them and
  [app/tournaments/[id]/page.tsx](app/tournaments/[id]/page.tsx) `safeDecode`s
  the param and branches: `isTournamentId` (6-digit) → internal; otherwise
  `getExternalTournament` → [ExternalTournamentView](components/dashboard/tournaments/ExternalTournamentView.tsx),
  which reuses the internal hero template plus an "About" bubble that renders the
  provider blurb as markdown ([Markdown](components/dashboard/tournaments/Markdown.tsx)
  — a dependency-free, XSS-safe subset that builds React nodes, never
  `dangerouslySetInnerHTML`) and final standings, and keeps a "View on
  start.gg/FACEIT" out-link. **A start.gg tournament's real "About" lives in its
  internal widget layout, not the public API.** On `gql/alpha` the tournament
  `rules`/`customMarkdown`/`details` are a bare link or empty; the rich content
  (the Welcome / Format / Schedule / Prizes markdown widgets on the Details tab)
  is served only by the undocumented `profileWidgetPageLayout(profileType,
  profileId, page:"details")` query on `www.start.gg/api/-/gql` (no auth, just a
  `client-version` header). The scraper (`fetchWidgetContent` in its `startgg.ts`)
  pulls that best-effort and **preserves the layout**: the response `rows` are
  sections → columns → widgets, and we keep that structure (a row's 1–3 column
  split, each column's markdown/image/video widgets in order) as
  `about_layout` JSON, dropping only the *view* widgets (Events/Attendees/Rules/
  Prizing/…) that we render from our own projection. ImageWidgets reference their
  image by `config.imageId`, resolved through the layout's `images` list where
  each image's `type` **is** that widget image id. The flattened markdown is also
  kept as `description` (for `pickDescription`'s prose-vs-link choice and as a
  fallback); it degrades to `rules` if the endpoint/version ever changes.
  Rendering: [AboutLayout](components/dashboard/tournaments/AboutLayout.tsx)
  mirrors start.gg — each row a CSS grid of its own column count (collapsing to
  one column under 782px), markdown via the `Markdown` renderer, images as linked
  `<img>`, videos as YouTube embeds (else a link). **start.gg's MarkdownWidget
  content is markdown MIXED with raw HTML** (`<div style>` wrappers, styled `<a>`,
  `<img>`); the `Markdown` renderer folds the common tags into markdown
  (`htmlToMarkdown`: `<a>`→link, `<img>`→image, `<br>`/`<hr>`, `<b>`/`<i>`) and
  strips the rest with their inline CSS, so nothing renders as literal `<div…>`
  text. When there's no layout (FACEIT, or a start.gg tournament with none), the
  `description` renders as single-column markdown instead. Beside the About
  bubble, the Overview tab carries a **Details** panel (`.ff-tfacts`, a
  single-column key/value list) of our structured facts — game, location,
  start/end, entrants, plus extras the projection collects: **registration
  close** (start.gg
  `registrationClosesAt` / FACEIT `subscription_end`, shown only while ahead), a
  **stream** link (start.gg's first `streams` → `twitch.tv/<name>`, or FACEIT's
  active `stream`), **contact** (start.gg `primaryContact` + type), **prize pool**
  (FACEIT `total_prizes` / start.gg cash `payoutTotal`), **organizer** (start.gg
  `owner` / FACEIT organizer, name → link), **social links** (start.gg `links` /
  FACEIT organizer socials, `links_json`), and a "Rules" link when the description
  is only a bare URL. `about_layout`/`links_json`/`images_json` are parsed
  defensively on read (`parseAboutLayout`/`parseLinkList`/`parseImageList`,
  http(s)-only). The start.gg extras come from two places: the public API deep
  query (`owner`/`links`/`streams`/`primaryContact`/event `prizingInfo`) and the
  internal widget-layout fetch. The hero banner is a real `<img>` layer (like the
  list cards), not a CSS background, so a valid URL always paints.
  The bracket is
  [ExternalBracket](components/dashboard/tournaments/ExternalBracket.tsx) (a
  client component): it reuses the internal `BracketView`'s `ff-bracket__*`
  card/column **and connector** CSS and is driven by the scraped matches — the
  round headers are the provider's own names ("Winners Round 1", "Grand Final",
  "Losers Semi-Final"; a FACEIT double-elim splits on its `group` field into
  "Winners/Losers Round N", other FACEIT formats stay "Round N"), each
  side shows its score with the winner highlighted, and every card deep-links to
  the provider's own match/result page (start.gg set URLs are built from the
  event slug; FACEIT uses the match room URL). Columns are ordered by
  `round_order` (signed: +winners/−losers) and matches within a column by
  `order_key` (start.gg's set identifier), both now carried in the projection.
  [getExternalTournament](lib/external-tournaments.ts) funnels every numeric
  match field (`round_order`, scores, `winner`) through a `toNum` coercion,
  because the projection can be (re)loaded by tools other than the scraper — a
  CSV/export round-trip can leave a numeric column holding a string, or even the
  column NAME from a header row, and reading those verbatim used to leak
  "entrant_1_score" into a slot and collapse every match into one column
  (`Math.abs("round_order")` is NaN). Junk now degrades to null. The bracket
  splits matches into **sub-brackets** two levels deep, each its own
  **browser-style tab** (`.ff-bracket__tab*`, one visible at a time) — stacking
  them mashed unrelated rounds into one column set with connectors crossing
  between brackets. First by **phase** (`phase_id`/`phase_name`/`phase_order`) —
  a start.gg event can hold several independent brackets ("Round 1 Bracket" +
  "Round 2 Bracket"). Then each phase splits into **pools** (phase groups): a
  single phase can run several disjoint pool brackets ("A1".."A4") that share one
  `phase_id` **and identical round names**, so without splitting them the four
  pools stacked into shared columns (the "ugly" bracket). The view prefers the
  explicit `phase_group_id`/`phase_group_name`/`phase_group_order` the projection
  carries (labels the tab "Pool A1"); when that's absent — data scraped before
  the phase-group columns existed, or a provider without pools — it **infers
  pools as the weakly-connected components of the feed graph**, since disjoint
  pools share no prereq edges (a single bracket, winners+losers joined by
  loser-drop prereqs, is one component → one tab, unchanged). That inference is
  **gated on a feed graph existing** (`hasFeedGraph`): with no prereq edge at all
  — FACEIT ships none, and a start.gg bracket scraped before its sets carry them —
  every match would be its own singleton component (one "Pool" tab per match), so
  such a phase stays a single bracket. Tabs are labelled
  by pool, by phase, or `phase · Pool` when both split. Within a sub-bracket it
  groups columns by round NAME (robust when `round_order` is absent),
  and a missing/forfeit score renders as a dash, never a blank cell.
  Feed-forward connectors prefer the **true feed graph**, not guessed
  geometry: every set stores the source-set id feeding each slot
  (`prereq_1_id`/`prereq_2_id`, from start.gg's `prereqId` where
  `prereqType = "set"`), and the view draws a measured elbow from a feeder's
  right-edge **centre** to the target's left-edge **centre** — so both feeders of
  a match converge on the box's single mid-point (never a slot) — **only when the
  feeder is in the same section** (winners or losers). That single rule reproduces
  exactly what start.gg itself draws: within a bracket you only advance by
  winning, while a loser always drops to the OTHER bracket, so the cross-bracket
  loser-drops and the Losers-Final→Grand-Final feed are intentionally omitted
  (they'd clutter the tree). This captures the shapes ⌊m/2⌋ geometry can't —
  play-ins, byes, losers-bracket cross-feeds, grand-final resets. When a
  section carries no feed graph (a start.gg event scraped before its sets have
  prereqs, or FACEIT which ships none), it falls back to geometric column
  adjacency (column c match i → column c+1 match ⌊i/2⌋) so the bracket still shows
  lines. That fallback runs for **start.gg** and for **any event with a losers
  bracket** (double-elim — incl. FACEIT, whose `group` field is split into
  winners/losers upstream in the scraper). A FACEIT **swiss/league** event has no
  losers, so it stays plain columns, where a team recurs across "rounds" and tree
  connectors would be a lie.
- **External team icons are resolved by the scraper, not at render time.**
  start.gg's entrant `team.images` (the data behind `/attendees/teams`) and
  FACEIT championship subscriptions/team records supply provider logos.
  FACEIT's canonical participant page is
  `/championship/<id>/<encoded name>/teams`; the stable Data API equivalent is
  `/championships/<id>/subscriptions`, with a small bounded number of
  `/teams/<id>` lookups for premade teams. When those provider objects omit an
  icon (their default-avatar state), the scraper first matches a leading
  canonical `school_favicons` phrase, then checks its source-controlled,
  high-confidence alias phrases (for example `UTD Black` → University of Texas
  at Dallas). Generic acronyms such as `ASU`, `USC`, and `WSU` deliberately stay
  unresolved unless a longer team phrase identifies one school. Provider art
  always wins, but the resolved canonical name + domain are still stamped into
  `ext_matches.entrant_*_school_*` and `ext_standings.entrant_school_*`; this is
  the durable affiliation, while the favicon is a display fallback. The lookup
  is generated from the Hipo directory plus
  [scripts/supplemental-schools.mjs](scripts/supplemental-schools.mjs) by
  `npm run db:seed:generate` and seeded into `cen-sql` separately, keeping
  Commons reads flat and cross-D1-free.
- **The dashboard shell for the whole tab lives in
  [app/tournaments/layout.tsx](app/tournaments/layout.tsx)**, not the pages, so
  `loading.tsx` skeletons and `[id]/error.tsx` render inside the content area
  beside the rail (the rail stays mounted across list↔detail and reloads)
  instead of the whole page being replaced by a centered skeleton that then
  jumps into place. New pages under `/tournaments` should return content only.
- **On-demand top-up refresh.** The branded view renders from the cached
  projection first (never blank), then [ExternalTournamentRefresh](components/dashboard/tournaments/ExternalTournamentRefresh.tsx)
  (client) POSTs `app/api/tournaments/external/[id]/refresh` on open;
  [lib/external-refresh.ts](lib/external-refresh.ts) asks the **cen-scraper**
  Worker (`CEN_SCRAPER_URL` + shared `CEN_REFRESH_SECRET`) to re-pull just that
  tournament, and only a real change triggers a `router.refresh()`. The Commons
  still never writes `cen-sql` — the scraper owns the write, gated by a bearer
  secret and a per-tournament ~2 min TTL lease. Every hop degrades: no secret,
  no scraper URL, a timeout, or an error just leaves the cached view in place.
- **Reload consistency (the framework for when this data becomes writable).**
  Today the projection is read-only from the Commons, but reads and writes are
  already structured so a reader never catches cen-sql mid-reload: the scraper
  rewrites a tournament as a single atomic `db.batch` (`replaceTournament` —
  delete children + re-insert, all-or-nothing), and the Commons reads the whole
  detail as a single atomic `db.batch` snapshot (`getExternalTournament` — the
  tournament plus its events/standings/matches, children keyed off a
  tournament-id subquery, which also sidesteps D1's bind limit). So a scrape or
  on-demand refresh landing between reads can't produce a half-updated view.
  On top of that: the refresh write is idempotent + TTL-bounded (safe under
  concurrent opens), reads degrade rather than throw (missing binding/row →
  empty/`notFound`), the `/tournaments` routes have `loading.tsx` skeleton
  screens for the reload window, and `app/tournaments/[id]/error.tsx` catches
  any unexpected throw with a retryable card. Keep new writers atomic-batched
  and new multi-table reads snapshot-batched to preserve this.
- `/schedule` reads `ext_matches` for its **All Matches** calendar. FACEIT rows
  come from a championship-matches request the scraper already makes for roster
  data; start.gg set page 1 rides the existing deep query and only additional
  pages cost extra calls. start.gg frequently leaves `startedAt` null before a
  set begins, so those rows deliberately render under Date TBD.
  `listUpcomingExternalScheduleEntries` **merges two layers**: the matches from
  `ext_matches`, PLUS a single start-date entry for every upcoming tournament
  that has *no matches at all* yet (deduped by tournament id). Every match that
  exists is placed on the grid: a timed match on its own day, an **untimed
  bracket set on its tournament's start day** — via `ScheduleEntry.dayAt` (the
  calendar POSITION), which is separate from `scheduledAt` (the DISPLAYED time,
  still "Time TBD" when null). So untimed sets no longer disappear into "Date
  TBD"; a tournament shows one grouped chip on its start day that expands to all
  its matches. This is what keeps the calendar in step with the Tournaments tab —
  it uses the existing projection, never a re-scrape.
- The calendar ([ScheduleView](components/dashboard/schedule/ScheduleView.tsx))
  keeps every day cell a fixed-height square. A tournament's many matches
  collapse into ONE chip (via `ScheduleEntry.groupKey`/`groupTitle`, set to the
  tournament in `listUpcomingExternalScheduleEntries`); a day shows at most
  `MAX_DAY_CHIPS`, then a "+N more". A multi-match chip or "+N more" opens a
  per-day popup that expands every tournament's matches in chronological order.
  Cells never scroll — overflow lives in the popup.

### Overwatch player statistics — the third D1 (`ow-player-data`)

The **Statistics** tab (`/statistics/`, a **plain top-level tab** — not a rail
group) shows a member's Overwatch career, sourced from the unofficial **OverFast
API** (`https://overfast-api.tekrop.fr`, which scrapes a player's public Blizzard
career page by BattleTag). The **Player Data / Match Data** split is **browser-style
tabs inside the page**, under a shared profile header (`.ff-owtab*`), deliberately
not the admin-style rail slide-out. "By game" is the intended shape; Overwatch is
the only game today; Match Data is the cross-provider match history (next section).

- **A THIRD D1, `ow-player-data`**, bound as **`OW`** ([db/ow-schema.ts](db/ow-schema.ts),
  migrations in `drizzle-ow/`, [lib/ow-db.ts](lib/ow-db.ts) `getOwDb()` degrades to
  null when unbound). The OW tables: `ow_players` (a small mutable registry — battletag,
  the OverFast `player_id`, the cached public/private `visibility`, and `poll_chunk`
  0–23 = `chunkForUser`) and **`ow_snapshots` (APPEND-ONLY** — one career snapshot per
  player per day, never overwritten, so members can see improvement over time). The
  same database also carries the `pd_*` cross-provider player-data tables (next
  section). It's
  joined to `website-sql` only in app code by `user_id` (D1 can't JOIN across
  bindings), exactly like cen-sql.
- **Two writers, unlike cen-sql** (which the Commons reads read-only). The Commons
  ([lib/ow-stats.ts](lib/ow-stats.ts)) snapshots on **Battle.net connect** (the
  account-created hook in [lib/auth.ts](lib/auth.ts) calls `snapshotOnConnect`) and
  **lazily on a Statistics read** past a TTL; the separate **`ow-data`
  Worker** (its own repo, like cen-scraper) snapshots a chunk of due players every
  hour by cron. Both are safe together because snapshots are append-only and both
  respect `MIN_SNAPSHOT_INTERVAL_MS` (~20 h), so a connect + a page open + a cron
  tick in one day produce ONE row. The **Commons owns the schema/migrations**; the
  poller keeps a **column-compatible copy** of `db/ow-schema.ts` + `lib/overfast.ts`
  (+ the player-data mirrors, next section) and only reads/writes rows.
- **The public-profile gate.** OverFast only reads a career profile set to public.
  `getOwVisibility` (TTL-cached in the registry, mirroring `connectReachability`)
  classifies `public | private | not_found | unknown` from `/stats/summary`; the
  Player Data page renders a clear error for private/not-found instead of empty
  charts. OverFast caches player **career for 1 hour** (its *search* cache is 10 min —
  a different thing), so the "already public?" copy says it can take **up to an
  hour** to catch up. Only a definitive answer is trusted — an outage stays
  `unknown` and never cries "private."
- **[lib/overfast.ts](lib/overfast.ts) is the only module that talks to OverFast**,
  and is **pure** (base-url arg + global `fetch`, no `getCloudflareContext`) so the
  poller imports it unchanged. Best-effort like the schedule adapters: a timeout,
  never throws. `OVERFAST_API_URL` overrides the base (self-hosting); the poller's
  manual-run endpoint is gated by its own `OW_POLLER_SECRET` (not a Commons var).
- **Client-loaded behind a loading bar, not an SSR freeze.** `app/statistics/page.tsx`
  renders the shell instantly (passing only `linked`/`enabled`/`battletag`);
  [StatisticsView](components/dashboard/statistics/StatisticsView.tsx) (client) then
  fetches [`GET /api/statistics/player`](app/api/statistics/player/route.ts) →
  `getStatisticsData` (visibility + snapshot refresh + history + the OverFast
  `/heroes` roster for portraits, in parallel). While that multi-second round-trip
  runs, [StatLoading](components/dashboard/statistics/StatLoading.tsx) shows a
  climbing progress bar — the OverFast API gives no real progress, so it eases toward
  ~92 % and the parent unmounts it on arrival. **Never do the OverFast fetch in the
  page's server render** — that's what froze the tab before.
- **Accurate ranks, everything else gated.** Blizzard's public OW data has been
  inaccurate since the OW2 launch (2023) — only the **competitive ranks** (division
  + tier; there is **no SR number** in the public data) are trustworthy. So the
  profile header ([StatisticsView](components/dashboard/statistics/StatisticsView.tsx)
  `HeaderRanks`) surfaces the per-role ranks under the endorsement row as the
  headline, and the whole stats **dashboard is wrapped in `LockedStats`** — a
  **blur + warning overlay** (`.ff-owlocked*`) that explains the inaccuracy, links
  to the Blizzard OW feedback forum (`BLIZZARD_FEEDBACK_URL` in
  [PlayerDashboard](components/dashboard/statistics/PlayerDashboard.tsx)), and only
  un-blurs on an explicit "View your inaccurate statistics" click. Don't present the
  non-rank numbers as fact — they're kept (they become correct if Blizzard ever fixes
  the dataset) but never shown un-gated.
- **The dashboard** ([PlayerDashboard](components/dashboard/statistics/PlayerDashboard.tsx),
  client, behind the gate) is modeled on Blizzard's own career screen, in our
  bubbles: a three-column layout (`.ff-owcols`) — **Time Played** (total + per-role
  bars), **Most Played Heroes** (top-3 with OverFast portraits) + a per-role stats
  table (games / won / win %), and **Hero Comparison** (a metric-select bar list,
  leader in OW orange) — then our own **Progress Over Time** single-series inline-SVG
  charts underneath (no chart lib; hover crosshair; meaningful only past 2 snapshots).
  Headline scalars are denormalized columns so the charts query without parsing a
  blob per point; the full per-hero/role detail comes from the
  `summary_json`/`stats_json` blobs. Live-verified for the public path; the
  private-profile branch is written against the observed shape and wants one
  live-verify against a genuinely private account (like the FACEIT/start.gg adapters).

### Cross-provider player data — external teams + match history (`pd_*`)

A member's **FACEIT / start.gg teams** and their **full match history across
FACEIT / start.gg / Challonge**, pulled by the external ids captured at OAuth
link time, shown in two places: external teams render **inline in the Teams tab**
(provider glyph in the card corner, opening a branded `/teams/<provider:id>/`
detail view with roster + that team's matches) and the member's matches fill the
**Statistics → Match Data tab**. Lives in the **same third D1**
(`ow-player-data`) as tables prefixed `pd_*` ([db/ow-schema.ts](db/ow-schema.ts),
documented in [db/README.md](db/README.md)); the same `ow-data` Worker crons it.

- **The split**: [lib/player-data-sync.ts](lib/player-data-sync.ts) is the
  **pure sync core** (fetch + parse + apply against a passed-in Drizzle handle —
  no cloudflare context, no Better Auth) and is **mirror-copied into the
  `ow-data` repo** (like `overfast.ts`; only its two import paths differ).
  [lib/player-data.ts](lib/player-data.ts) is the Commons wrapper: it mirrors
  `platform_identities` into the `pd_sync` registry (so the poller never needs a
  website-sql binding — the `ow_players` battletag rule again), runs the lazy
  TTL-gated sync, and owns every page read.
  [lib/player-data-shared.ts](lib/player-data-shared.ts) is the client-safe half.
- **Sync cadence** (all writers respect `pd_sync.last_synced_at` + the shared
  1 h TTL, so they never duplicate work): page open fires
  `POST /api/player-data/refresh` after paint (the ExternalTournamentRefresh
  pattern — `PlayerDataAutoRefresh`, only a `changed: true` re-renders); the
  refresh icon sends `force: true`, which drops the gate to a 2 min floor; and
  the `ow-data` cron syncs the `poll_chunk == UTC hour` bucket hourly (~once a
  day per member) plus a stale catch-up. **Challonge rows are cron-exempt**: they
  read via the member's OAuth token (`getAuth().api.getAccessToken`, the
  lib/schedule.ts path), which only exists Commons-side.
- **Unbounded backfill, bounded ticks.** Full history was the requirement, so
  each tick advances `pd_sync.backfill_cursor` by a budgeted number of API calls
  (FACEIT 4×100-match pages; start.gg 4×20-set pages; Challonge 2 tournaments)
  until the provider is exhausted (`backfill_done`), after which ticks are one
  cheap incremental page. Matches upsert on `(user, provider, external_match_id)`
  so overlap is idempotent; a failed tick leaves the cursor unadvanced and
  resumes. No raw payload blobs are stored — parsed columns only, because a
  veteran account runs to thousands of matches.
- **Provider reads** (server keys for FACEIT/start.gg, member token for
  Challonge): FACEIT teams are the documented `/players/{id}/teams` +
  `/teams/{id}` (history factions carry `players`, though docs say `roster` —
  both parsed; pickup "teams" have the player's own guid as `team_id`, which is
  why only ids present in `pd_teams` attribute to team pages). **start.gg
  user→teams exists only on the internal endpoint** (`www.start.gg/api/-/gql`,
  `client-version` header, no auth — the cen-scraper widget-layout precedent);
  its `user.teams` nodes are **EventTeams**, normalized to their `globalTeam`
  and deduped, which is also why `pd_matches.team_external_id` stores the
  **GlobalTeam** id from the sets query's
  `team { ... on EventTeam { globalTeam { id } } }`. start.gg sets come from the
  documented `player(id){sets}` (player id resolved once from the stored user id
  and cached in `pd_sync.meta`). Challonge shapes match the org-key reads in
  [lib/challonge.ts](lib/challonge.ts) (same v2.1 API, member-token auth);
  its cursor keeps a `seen` map of tournament→state so completed tournaments are
  never re-pulled. Live-verified end-to-end for FACEIT + start.gg (cursor
  resume and TTL dedupe included); the Challonge path is code-complete but
  unverified against a member token, same status as the schedule adapters.
- **Errors are a member-visible state, not silence**: `pd_sync.status`
  (`ok`/`private`/`not_found`/`error`) surfaces on the Match Data tab per
  provider (`PD_STATUS_MESSAGES`), with the connectReachability rule — only a
  definitive provider answer sets `private`/`not_found`; outages stay `error`
  ("usually temporary"). Every read degrades to empty when `OW` is unbound.
- **UI**: [MatchPanel](components/dashboard/statistics/MatchPanel.tsx) (client)
  reuses `StatLoading` and caches its last response in **sessionStorage**
  (`ff-matchdata-v1`, stale-while-revalidate — paint cached instantly, refetch in
  background) so tab-hopping never re-waits; `StatisticsView`'s Battle.net gates
  were moved INTO the Player Data panel so Match Data stays reachable for members
  without Battle.net. [MatchList](components/dashboard/statistics/MatchList.tsx)
  is shared (no directive) between that tab and the server-rendered
  [ExternalTeamView](components/dashboard/teams/ExternalTeamView.tsx). Opening an
  external team requires a `pd_team_links` row — a team you're not linked to is
  a 404, matching the internal-team rule.

### Styling

**No CSS framework.** `styles/theme.css` is the design system (every selector
prefixed `ff-`) layered over `styles/wp-globals.css`, which carries the brand
tokens and is WordPress-emitted GPL output — **do not edit it**. theme.css must
be imported last. Inside the dashboard, font sizes and spacing come from the
`--ff-dash-text-*` / density tokens on `.ff-dash`; never hardcode either. The
bubble/row component vocabulary, the "blue commits a change, outline doesn't"
button rule, and the density system are all specified in
[docs/dashboard-guide.md](docs/dashboard-guide.md).

## The Discord bot and the D1 boundary

The Python bot lives at
`/Users/oscar/Desktop/Code Projects/Fault Foundation DC Bot` (discord.py; its
`docs/WEBSITE_TICKET_BRIDGE.md` is the other half of the bridge contract).

### One operational datastore

Commons D1 `website-sql` is the sole operational datastore for member identity,
registration and support. The bot has no Google Sheets, Google Forms, Apps
Script or local-database runtime; its retained surfaces are WordPress news,
Givebutter notifications and support. Configuration comes from environment
variables. Compact Discord channel-topic metadata is only enough to operate a
ticket channel while Commons is unavailable; it is not a second source of truth.

The bot still holds no D1 credential, no Cloudflare API token, and issues no
SQL. The only channel is the HTTP bridge below. Keep it that way: handing the bot
direct D1 access would put a full-database credential on managed third-party
hosting.

The systems join by **Discord user ID**. The bot sends that id; Commons resolves
`platform_identities` (`provider = 'discord'`, `external_id`) through
`getUserIdByDiscordId` ([lib/tickets.ts](lib/tickets.ts)). Tickets carry a second
key, `support_tickets.discord_channel_id`, uniquely indexed so one Discord
channel maps to one D1 ticket. Attribution degrades rather than fails:
`support_tickets.user_id` is nullable and the Discord id/name are always
captured, so a ticket from someone with no site account still works.

**Rule for new work:** add persistent state to `db/schema.ts` and expose it
through a narrow bridge route when the bot needs it. Do not add another bot-side
datastore or move registration, verification or moderation logic back into the
bot.

### Historical Google migration

The old Google workbook remains untouched as historical source material; the
bot no longer reads it. `scripts/migrate-legacy-bot-data.mjs` consumes a
sanitized, untracked JSON export and maps normalized users, registrations,
platform handles and ticket metadata into existing D1 tables. IDs are
deterministic, ownership conflicts fail closed, `--apply` backs up local D1, and
there is deliberately no remote execution mode. `--output-sql` writes only
below ignored `temp/` for a human-reviewed remote upload.

The migration never carries plaintext verification codes, attempts, code
timestamps, kick/ban data, notes, secrets, bot config, changelog rows or raw form
copies into D1. `VERIFIED` remains verified; non-verified application rows go to
`MANUAL_REVIEW`; lifecycle-only rows receive identity records without an
invented membership. Pre-created Discord `account` rows are claimed by Better
Auth on first OAuth login, when fresh tokens replace their intentionally empty
token fields.

### The bridge

**D1 is the source of truth.** The bot can only make outbound calls (managed
hosting, no public port), so the two directions are asymmetric:

- **Discord → site** is push: the bot POSTs to `app/api/bot/*`, HMAC-SHA256
  signing the raw body with `BOT_API_SECRET` in `X-Signature`
  ([lib/bot-auth.ts](lib/bot-auth.ts), [lib/hmac.ts](lib/hmac.ts)). The
  body-less outbox poll bears the same secret as a bearer token.
- **Site → Discord** is pull: dashboard actions `enqueueBotJob` into the
  `bot_outbox` table ([lib/bot-outbox.ts](lib/bot-outbox.ts)); the bot polls
  `GET /api/bot/outbox` every ~5s and acks. Claimed-but-un-acked jobs are
  re-offered after a 60s visibility timeout. Enqueueing **never throws** — a
  queue failure must not fail the D1 write it accompanies.

Both sides funnel through the same writers in [lib/tickets.ts](lib/tickets.ts),
so a ticket opened in Discord and one touched on the website obey identical
rules. Authorization is the caller's job (staff capability or the bot secret),
never the writer's. Message mirroring is idempotent on `discordMessageId`, and
`source` (`discord` | `website`) stops a staff reply the bot just posted from
round-tripping back in.

Both ends are best-effort by design: the bot logs and returns `None` rather than
raising into a Discord flow, and an unconfigured bridge silently no-ops on the
bot side while the site's routes return 503. Discord keeps working when the site
is unreachable, and vice versa.

## Security across the seams

The three trust boundaries, and what holds at each:

**1. Browser → site.** Better Auth session. Admin surfaces add a staff
capability re-read from D1 plus a fresh 2FA unlock (above). Every action
re-derives authorization server-side; nothing trusts a client claim.

**2. Bot → site (`app/api/bot/*`).** These are the **only routes with no user
session behind them** — they authenticate a *machine*, not a person. Whoever
holds `BOT_API_SECRET` can call them, so:

- Keep them narrow, keyed by Discord ids, and idempotent.
- They must never accept a site user id, a staff role, or a privileged action
  from the bot. Identity is *resolved* site-side from the Discord id
  (`getUserIdByDiscordId`), never asserted by the caller.
- An unset secret returns 503. **Never** fall back to accepting unsigned calls.
- Signature comparison is constant-time on both ends (`safeEqualHex` here,
  `hmac.compare_digest` in Python).
- Sign and verify the **exact raw bytes**. The bot serializes with
  `json.dumps(separators=(",", ":"))`; the site hashes `await request.text()`
  and parses that same string. Re-serializing or normalizing on either side
  breaks every signature — this is why `readSignedBotBody` returns the parsed
  body instead of handlers calling `request.json()`.

**3. Site → bot (`bot_outbox`).** The bot has no inbound listener at all — that
is a security property worth preserving, not merely a hosting constraint. It
also means outbox rows are effectively a **command channel**: the bot executes
what it finds there. Only enqueue from staff-gated actions, keep payloads to
plain data the bot interprets, and never place anything in a payload that came
straight from user input without going through the same escaping the dashboard
would apply.

### Secrets

Non-secret runtime vars live in `wrangler.jsonc`; secrets go in `.dev.vars`
locally and `wrangler secret put` in production. Optional bindings are declared
by hand in [types/env.d.ts](types/env.d.ts) (with the reasoning for each) since
`wrangler types` can't see unset ones. Integrations degrade rather than break
when absent: no `SUPPORT_EMAIL_APP_PASSWORD` logs the email body instead of
sending, no `BATTLENET_CLIENT_*` leaves Battle.net dark, no `BOT_API_SECRET`
makes the bot routes 503.

- `BETTER_AUTH_SECRET` encrypts TOTP secrets and backup codes and signs the
  admin unlock cookie. **Rotating it breaks every enrolled member's 2FA, with
  no reset path.**
- `BOT_API_SECRET` must match on both sides. The site stores it as a Wrangler
  secret; the bot reads it from its process environment (`.env` only for local
  development). Rotate both environment values together or the bridge goes dark.
- `.dev.vars` still carries `BOT_BRIDGE_SECRET` / `BOT_BRIDGE_URL` from the
  removed inbound-server design. Nothing in either repo reads them — dead keys,
  safe to drop.

## Open-source readiness

Both repos are intended to be publishable, and both are currently clean: no
secret file is tracked or anywhere in git history (checked across all local refs
for `.dev.vars`, `.env`, and `service_account.json`). Keeping that true:

- `.gitignore` already covers `.dev.vars` here and `.env` +
  `service_account.json` in the bot. `.dev.vars.example` and
  [types/env.d.ts](types/env.d.ts) are the documented surface — add new config
  there, never a real value.
- Some real values are **public by design and shouldn't be scrubbed**:
  `DISCORD_GUILD_ID`, the D1 `database_id` in `wrangler.jsonc`, and the
  workers.dev hostname are identifiers, not credentials.
- **PII is the bigger hazard than keys.** The historical Google workbook and
  local migration exports contain real member and ticket data. Never copy sheet
  rows, exports, transcripts, generated migration SQL or D1 dumps into either
  repo — not as fixtures, tests, seed files, or doc examples. The importer
  enforces generated SQL under ignored `temp/`; seed data is the public schools
  dataset plus bootstrap registry rows, nothing else.
- `service_account.json` remains an untracked historical-export credential in
  the bot working tree, not a runtime dependency. It is clean in history today;
  re-check before publication and rotate or remove the local credential then.
- Licensing/provenance is tracked in [README.md](README.md) — `wp-globals.css`
  is GPL-2.0+ WordPress output, the Manrope fonts are OFL, the schools dataset
  is MIT, and site content isn't implicitly licensed. Keep that list accurate as
  vendored files are added.
