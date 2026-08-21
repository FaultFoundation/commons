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
drive the app locally — note its claim that Playwright is a devDependency is
stale; it isn't installed.

Database:

```sh
npm run db:generate       # db/schema.ts change -> new SQL file in drizzle/
npm run db:migrate:local  # apply to local D1 (.wrangler/state)
npm run db:migrate:remote # apply to real D1 — run BEFORE npm run deploy
npm run staff:seed        # bootstrap the first staff owner (--email / --discord, --remote)
wrangler d1 execute website-sql --local --command "SELECT …"   # inspect
```

Migrations are **generated** by drizzle-kit and **applied by wrangler**
(`migrations_dir` in wrangler.jsonc points at `drizzle/`). Seeding, resets, and
the bootstrap registry rows are in [db/README.md](db/README.md) — which is also
the file to update in the same commit as any `db/generate` run (see above).

## Runtime model — the constraint behind most of the code

Cloudflare bindings (`DB`, `AVATARS`) and secrets only exist on the **request**
context. Nothing that touches them may be built at module scope:

- `getDb()` ([lib/db.ts](lib/db.ts)) and `getAuth()` ([lib/auth.ts](lib/auth.ts))
  construct fresh per request, off `getCloudflareContext()`. Never hoist or
  cache them into a module-level constant.
- Per-request work that several components repeat is memoized with React
  `cache` instead — `getSessionCached` ([lib/session.ts](lib/session.ts)),
  `getStaffRoles` ([lib/staff.ts](lib/staff.ts)). The Worker's CPU budget is
  real; rebuilding the Better Auth instance per component was a measurable cost.
- Session-gated pages set `export const dynamic = "force-dynamic"`.
- **D1 has no interactive transactions.** Drizzle's `transaction()` emits `BEGIN`,
  which D1 rejects — use `db.batch([...])` for writes that must land together.
- There is no `scheduled` handler: OpenNext generates `.open-next/worker.js`, so
  cron work has nowhere to hang without a wrapper or second Worker. Refresh-style
  work is done lazily on read (see the TTL in [lib/integrations.ts](lib/integrations.ts)).
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
  refreshes **lazily on read** past a status TTL (Workers has no cron) and
  **immediately** after any admin mutation (which bumps `tournaments.version`;
  `getOrRefreshSnapshot` rebuilds when the cache is behind that version).
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

### Styling

**No CSS framework.** `styles/theme.css` is the design system (every selector
prefixed `ff-`) layered over `styles/wp-globals.css`, which carries the brand
tokens and is WordPress-emitted GPL output — **do not edit it**. theme.css must
be imported last. Inside the dashboard, font sizes and spacing come from the
`--ff-dash-text-*` / density tokens on `.ff-dash`; never hardcode either. The
bubble/row component vocabulary, the "blue commits a change, outline doesn't"
button rule, and the density system are all specified in
[docs/dashboard-guide.md](docs/dashboard-guide.md).

## The Discord bot and its database

The Python bot lives at
`/Users/oscar/Desktop/Code Projects/Fault Foundation DC Bot` (discord.py; its
`docs/WEBSITE_TICKET_BRIDGE.md` is the other half of the bridge contract).

### Two datastores, deliberately not joined

| | Store | Credential |
|---|---|---|
| Commons | D1 `website-sql`, via Drizzle | Worker binding `DB` (never leaves Cloudflare) |
| Bot | Google Sheets (`GOOGLE_SHEET_ID`) + Apps Script | `service_account.json` |

**There is no database-level connection between them, and there must not be.**
The bot holds no D1 credential, no Cloudflare API token, and issues no SQL. The
only channel is the HTTP bridge below. Keep it that way: handing the bot direct
D1 access would put a full-database credential on managed third-party hosting.

The two stores are joined by **the Discord user ID**:
`platform_identities` (`provider = 'discord'`, `external_id`) is the site's side,
resolved by `getUserIdByDiscordId` ([lib/tickets.ts:432](lib/tickets.ts#L432)),
and it matches the bot's Sheets `Discord ID` column. Tickets carry a second key,
the Discord channel id (`support_tickets.discord_channel_id`, uniquely indexed —
one channel maps to exactly one ticket). Attribution degrades rather than fails:
`support_tickets.user_id` is nullable and the Discord id/name are always
captured, so a ticket from someone with no site account still works.

### The direction of travel: move weight off the bot

Much of the current work is **shrinking what the bot carries**. The bot's Sheets
`Users` tab (19 columns, `src/sheet_schema.py`) is a legacy duplicate of what D1
now models properly:

| Sheets `Users` column | D1 home |
|---|---|
| Discord ID, Username | `platform_identities` (`provider = 'discord'`) |
| Blizzard BattleTag / Steam Friend Code | `platform_identities` (`battlenet` / `steam`) |
| User Type, Graduation Date | `collegiate_registrations` |
| School Name / Website | `colleges` (resolved via the `schools` lookup) |
| Email | `user.email` / `collegiate_registrations.school_email` |
| Verification Code / Expires At / Attempts | `school_email_verifications` (**hashed**) |
| Status, Verified At | `program_memberships.status` / `verified_at` |
| DM Preference | `profiles.dm_preference` |
| KICK_TIME / BAN_TIME | `moderation_actions` |
| Form Row, Last Updated | no equivalent — Sheets bookkeeping, drops on migration |

Tickets have already made this trip: the `support_*` tables (LAYER 10 in
`db/schema.ts`) replaced the 13-column "Tickets" sheet, and
`scripts/migrate_tickets_to_website.py` in the bot repo was the one-time copy.

**Rule for new work:** D1 is the system of record. The bot should hold only
Discord-side state (channel ids, message ids, role ids) and reach for everything
else through the bridge. Don't add a column to the Sheets `Users` tab; add it to
`db/schema.ts` and expose it. Where a flow still exists in both places, the D1
one is the stronger path — e.g. Sheets stores the verification code in
plaintext alongside an attempts counter, while D1 stores only
`sha256(userId:code)`, compared in constant time with a TTL, a 5-attempt cap and
send throttling ([lib/registration.ts](lib/registration.ts)).

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
- `BOT_API_SECRET` must match on both sides — and on the bot side it lives in
  the **Google Sheets "Config" tab**, not in a vault. Its blast radius is
  therefore everyone with access to that spreadsheet plus the service account:
  treat sheet access as secret access, and rotate the site secret and the Config
  cell together or the bridge goes dark.
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
- **PII is the bigger hazard than keys.** The bot's Sheets `Users` tab holds
  real members' emails, school emails, graduation dates and (until migrated)
  live verification codes; ticket threads hold support conversations. Never copy
  sheet rows, exports, transcripts, or D1 dumps into either repo — not as
  fixtures, tests, seed files, or doc examples. Seed data is the public schools
  dataset plus the bootstrap registry rows, nothing else.
- `service_account.json` is a live Google credential sitting untracked in the
  bot's working tree. It's clean in history today; re-check before that repo is
  made public, and prefer rotating it at publication time regardless.
- Licensing/provenance is tracked in [README.md](README.md) — `wp-globals.css`
  is GPL-2.0+ WordPress output, the Manrope fonts are OFL, the schools dataset
  is MIT, and site content isn't implicitly licensed. Keep that list accurate as
  vendored files are added.
