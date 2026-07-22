# Dashboard Guide

How the member portal is built and how to extend it without breaking
anything.

## Routes

The portal lives at the top level (it used to sit under `/dashboard`, which
now 308s via `middleware.ts`). `/` stays the public Commons landing page.

| Route                          | Tab         | What                         |
| ------------------------------ | ----------- | ---------------------------- |
| `/home/`                       | Home        | Condensed widget views       |
| `/schedule/`                   | Schedule    | WIP                          |
| `/tournaments/`                | Tournaments | WIP (`#overfault` anchor)    |
| `/teams/`                      | Teams       | Your teams + create          |
| `/teams/<teamId>/`             | Teams       | One team: roster, invites, settings, scores |
| `/join/<token>/`               | —           | Invite landing (join a team) |
| `/account/`                    | Account     | Profile / integrations       |
| `/account/setup/`              | —           | Resolver → current step      |
| `/account/setup/academic/`     | —           | Step 1                       |
| `/account/setup/code/`         | —           | Code entry (part of step 1)  |
| `/account/setup/integrations/` | —           | Step 2                       |
| `/account/setup/team/`         | —           | Step 3                       |

Sign-up lands on `/account/setup/`; sign-in lands on `/home/`.

The core ideas:

- **Everything is a bubble.** Tabs have no page titles — each tab is a
  `.ff-bubble-grid` of `Bubble` cards (plus an invisible
  `screen-reader-text` h1 for accessibility). Think CarPlay: each tab is
  its own thing; the Home tab will eventually show condensed widget views
  of the other tabs.
- **The top bubble always stretches.** The first `Bubble` in a
  `.ff-bubble-grid` gets `span="full"`, on every page, always. A tab opens
  on one thing, not on two half things — the first card is what the tab *is*,
  and everything under it is detail. This is a convention, not a CSS
  `:first-child` rule, so a page can still opt out deliberately; if you find
  yourself opting out, the page probably wants a different first card.
- **Two clicks max.** Any action is reachable as: nav tab click → bubble
  control click. If a flow needs more, redesign it.
- **Title Case headers.** Every heading — nav items, bubble titles —
  is authored in Title Case in the JSX ("My Bracket", "Danger Zone").
  Field labels and body copy stay sentence case ("New username").
- **Fixed app-scale type.** The dashboard opts out of the marketing
  site's fluid clamp scale. Use the tokens below; never hardcode a
  font-size in dashboard CSS.

## Type scale

Defined on `.ff-dash` in `styles/theme.css`, so everything the shell
renders (tabs, register flow, dialogs) inherits them:

| Token               | Size          | Use for                              |
| ------------------- | ------------- | ------------------------------------ |
| `--ff-dash-text-xs` | 0.75rem / 12px | Locked notes, fine print            |
| `--ff-dash-text-sm` | 0.8125rem / 13px | Row labels, hints, setup strip, meta |
| `--ff-dash-text-md` | 0.9375rem / 15px | Body, values, inputs, buttons (the `.ff-dash` base) |
| `--ff-dash-text-lg` | 1.0625rem / 17px | Bubble titles                       |
| `--ff-dash-text-xl` | 1.375rem / 22px | Register step titles, empty states  |

Need a new size? Don't. Pick the nearest token; only extend the scale if
a whole new tier of hierarchy appears, and document it here.

## Density (spacing) scale

Same idea, same place: spacing *inside* a bubble is a token on `.ff-dash`, so
a member can pick how tightly the portal packs. **Never hardcode a padding or
gap inside a bubble** — use one of these, exactly as with the type scale.

| Token                    | Cozy (default)      | Controls                              |
| ------------------------ | ------------------- | ------------------------------------- |
| `--ff-bubble-pad`        | `clamp(16,2vw,20)`  | `.ff-bubble` padding                  |
| `--ff-bubble-head-gap`   | 10px                | header → body                         |
| `--ff-bubble-body-gap`   | 6px                 | row → row (and disclosure bodies)     |
| `--ff-row-pad-y/-x`      | 8px / 12px          | `.ff-row`, `.ff-disclosure__summary`  |
| `--ff-row-editor-gap`    | 8px                 | expanded editors, nested forms        |
| `--ff-tile-pad`          | 12px                | `.ff-integration`, `.ff-actions__panel` |
| `--ff-field-gap`         | 0.6em               | `.ff-auth__field` **inside the dash** |
| `--ff-reg-pad`           | `clamp(20,3vw,28)`  | `.ff-reg` setup cards                 |

The gap *between* bubbles (`.ff-bubble-grid { gap: 20px }`) is deliberately
**not** a density token — that rhythm is fixed.

Three presets, selected by `data-density` on the `.ff-dash` element:
`compact`, `cozy` (the `.ff-dash` base — no override block, so an absent or
unknown value lands here), and `comfortable` (the spacing the dashboard
shipped with before the tokens existed).

`.ff-auth__field` is shared with the public login/signup pages, so only the
`.ff-dash`-scoped override follows the density — never touch the base rule.

### Where the preference lives

`profiles.density` in D1 is the source of truth; the `ff-density` cookie caches
it so `DashboardShell` doesn't query on every render. `lib/density.ts` holds
the names, labels, and `asDensity()` normalizer, shared by both sides.

- **Read** — `DashboardShell` checks the cookie, and only on a miss resolves
  the session and reads the profile. It stamps `data-density` on `.ff-dash`
  and renders `DensityCookie`, a client no-op that writes the cookie (a server
  component may not).
- **Write** — `setDensity` in `app/account/actions.ts` updates the row *and*
  the cookie (a server action is the one server context allowed to set one),
  so the cache can't lag. `DensityRow` flips the attribute locally first for an
  instant preview.
- Deliberately not on `<html>`: the root layout is shared with the public
  marketing pages, and reading `cookies()` there would make them all dynamic.

## The template components

All in `components/dashboard/bubbles/`. `Bubble` and `BubbleRow` are
*shared* components (no `"use client"`, no server-only imports) so both
server pages and client editors can use them.

### `Bubble` — the universal card

```tsx
import { Bubble } from "@/components/dashboard/bubbles/Bubble";

<Bubble title="Player Stats (WIP)" variant="wip">
  <div className="ff-bubble__wip">Record · Maps Played — Coming Soon</div>
</Bubble>

<Bubble title="Danger Zone" variant="danger" span="full">…</Bubble>
```

- `title` — Title Case, rendered as an `h2`.
- `variant` — `"default"` | `"danger"` (red border/title) | `"wip"`
  (dimmed title; pair with a `.ff-bubble__wip` placeholder body).
- `span="full"` — spans the whole grid row. **Required on every page's first
  bubble** (see the rule above); also used for Danger Zone-style footers.
- `actions` — optional right side of the header (a badge or small button).

### `BubbleRow` — label / value / action rows

The universal shape for settings-style content:

```tsx
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";

<BubbleRow label="School" value={profile.schoolName} locked />
<BubbleRow
  label="Battle.net"
  value="Not connected"
  note="Coming Soon"
  action={<button className="ff-btn ff-btn--sm" disabled>Connect</button>}
/>
```

- `locked` — lock icon, muted background, and a default note
  ("Locked — contact support to change").
- `note` — fine print under the value.
- `action` — right-aligned control. Use `ff-btn--sm` inside rows.
- `children` — an expanded editor area rendered full-width under the row
  (see `InlineEditRow`).

### `InlineEditRow` — edit-in-place (client)

`components/dashboard/accounts/InlineEditRow.tsx` wraps `BubbleRow` with
an Edit button that expands into a single-field form. Pass
`onSave: (value) => Promise<string | null>` — return an error message to
show, or `null` on success. Multi-field editors (see `PasswordRow` in
`ProfileRows.tsx`) are written bespoke on top of `BubbleRow` instead.

### `ConfirmDialog` — destructive confirmations (client)

Native `<dialog>`-based modal (`components/dashboard/bubbles/ConfirmDialog.tsx`).
The parent owns all state, including any input passed as children; Enter
confirms, Esc/Cancel closes. Use `danger` for red confirm buttons. See
`DeleteAccount.tsx` for the full pattern.

### `Disclosure` — collapsible row

`components/dashboard/bubbles/Disclosure.tsx`. Same shell as `BubbleRow`,
but the body expands on click. Native `<details>`, so no client directive
and it works without JS. Used for the team options in setup step 3.

### `SetupBanner` — the amber "action required" bar

`components/dashboard/SetupBanner.tsx`, rendered by `DashboardShell` on
every tab that passes `setupUserId`. Exactly one prompt shows, in priority
order:

1. academic email not `VERIFIED`, or Discord not linked → finish setup
2. set up but on no team → create or join a team
3. on a team but entered in nothing → join a tournament

Renders nothing once all three hold. Don't pass `setupUserId` on pages that
*are* a setup step — `SetupShell` already omits it.

### `SetupShell` — chrome for the setup wizard

`components/dashboard/setup/SetupShell.tsx`. Wraps `DashboardShell` (Account
tab active, no banner) and draws the numbered step rail. Takes `step: 1 | 2
| 3`; the code-entry page passes `1` because it belongs to step 1.

## Recipe: add a new tab

1. Create `app/<tab>/page.tsx` from this skeleton:

   ```tsx
   import type { Metadata } from "next";
   import { headers } from "next/headers";
   import { redirect } from "next/navigation";

   import { DashboardShell } from "@/components/dashboard/DashboardShell";
   import { Bubble } from "@/components/dashboard/bubbles/Bubble";
   import { getAuth } from "@/lib/auth";

   // Session-gated: always rendered per request.
   export const dynamic = "force-dynamic";

   export const metadata: Metadata = { title: "My Tab", robots: { index: false } };

   export default async function MyTabPage() {
     const session = await getAuth().api.getSession({ headers: await headers() });
     if (!session) redirect("/login/");

     return (
       <DashboardShell active="mytab" setupUserId={session.user.id}>
         <h1 className="screen-reader-text">My Tab</h1>
         <div className="ff-bubble-grid">
           {/* The first bubble always spans the grid. */}
           <Bubble title="First Bubble" span="full">…</Bubble>
         </div>
       </DashboardShell>
     );
   }
   ```

2. In `components/dashboard/DashboardShell.tsx`, add the key to
   `DashboardNavKey` and give the nav item an `href` in `NAV_ITEMS`
   (items without an `href` render dimmed as "Coming soon").

That's it — the strip, sidebar, and responsive behavior come from the
shell.

## Recipe: add a new bubble to a tab

1. Do all reads in the tab's server page (session, drizzle queries) and
   pass plain serializable data down. **Never pass functions across the
   server → client boundary.**
2. Static content: compose `Bubble` + `BubbleRow` right in the page.
3. Interactive content: add a `"use client"` component under
   `components/dashboard/<tab>/`, build it on `BubbleRow` /
   `InlineEditRow` / `ConfirmDialog`, call Better Auth via
   `authClient` (or a server action for domain logic), then
   `router.refresh()` so the server tree re-renders.
4. Keep the bubble self-contained: it must not care where in the grid it
   lives. That's what makes the future Home widget view possible —
   condensed variants of these same bubbles.

## Team roles

`team_members.role` is the permission tier — `manager | captain | coach |
player` — and `lib/teams-shared.ts` owns the whole model:

| Capability         | manager | captain | coach | player |
| ------------------ | :-----: | :-----: | :---: | :----: |
| `viewStats`        |    ✅    |    ✅    |   ✅   |   ✅    |
| `reportScores`     |    ✅    |    ✅    |       |        |
| `editSettings`     |    ✅    |    ✅    |       |        |
| `manageRoster`     |    ✅    |    ✅    |       |        |
| `manageInvites`    |    ✅    |    ✅    |       |        |
| `enterTournaments` |    ✅    |    ✅    |       |        |
| `deleteTeam`       |    ✅    |         |       |        |

Rules that live in code rather than the table:

- **Never compare role names** (`role === "manager"`) in a page or component.
  Gate on `can(role, capability)`; a new capability is a new entry in
  `TEAM_CAPABILITIES` plus the action and bubble that honor it.
- Actions open with `requireTeamCapability(userId, teamId, capability)`
  (`lib/teams.ts`), which re-reads the membership from D1 every time.
- Only managers mint managers (`assignableRoles`), nobody may act on someone
  who `outranks` them, and a team always keeps at least one manager — the last
  one can't be demoted, removed, or leave.
- Deleting a team with several managers opens a vote in
  `team_delete_requests` / `team_delete_votes`: every *current* manager must
  approve, and one decline cancels it. A sole manager deletes outright.
- Deletion is a **soft delete** (`teams.disbanded_at`): tournament entries and
  match history survive. Every team query filters `disbanded_at IS NULL`,
  memberships to `status = 'active'`, and entries to `withdrawn_at IS NULL`.
- A member may be on many teams but only one per tournament. Both directions
  of that check are `joinConflicts` / `entryConflicts` in `lib/teams.ts` —
  call them from anything new that adds a player or enters an event.

Invites are `team_invites` rows: one reusable `kind = 'link'` per team (the
newest un-revoked one wins; rotating revokes and re-inserts) plus single-use
`kind = 'targeted'` invites that carry a role. Links render **masked** with a
reveal toggle — a screenshot or a stream must not hand out a join link — while
the copy button always writes the real URL.

`/join/<token>/` shows the team first and asks questions second: signed-out
visitors get a splash (team, school, the role they'd join as, who invited
them) with a **Sign in or register to join** button carrying `?next=` back to
the invite. That page is the one portal route that must render **without**
`DashboardShell` when there's no session — the shell's nav and Sign out button
mean nothing to a signed-out visitor — so it falls back to the auth pages'
container inside a plain `ff-dash` wrapper (`.ff-join`).

Team layout: `/teams/` is an action row (`TeamsActions`) over the member's team
cards; `/teams/<id>/` is a **single-column** `ff-bubble-grid--single` in
priority order — header (identity + settings + the Invite Players disclosure),
Roster, Report a Score, Tournaments, Danger Zone. There is no separate Team
Settings bubble; `TeamSettingsRows` is the header's row set, and a team's
region/timezone are prefilled at creation from the creator's verified college
(`getCollegeRegion`) and their browser zone, then edited through dropdowns
(`RegionRow` uses the same `schools` country list the registration form does).

## Score reporting

`lib/scoring.ts`. Either team's manager or captain reports, and the report
applies immediately — there is no opponent confirmation. `matches.status`
goes straight to `confirmed`, and `recomputeStandings` rebuilds
`wins/losses/map_diff/points` for the whole tournament from its confirmed
matches, so re-reporting a corrected score replaces rather than accumulates.

## Backend notes

- Account mutations (name/email/password/unlink/delete) are Better Auth
  client calls — no custom endpoints. Server actions
  (`app/account/setup/actions.ts`) exist only for domain logic Better Auth
  doesn't own.
- Verification codes are 6 uppercase alphanumerics. D1 only ever stores
  `sha256(userId:code)` (`lib/registration.ts`), compared in constant time,
  with a 24h TTL, a 5-attempt cap, and 60s/5-per-24h send throttling.
- A school-email domain that doesn't match the school still gets a code;
  the outcome is recorded as `collegiate_registrations.domain_matched` for
  the future admin layer. The two paths that still can't self-serve are
  "None of the above" and an email another member already verified with —
  both land in `MANUAL_REVIEW`.
- Emails go out over Gmail SMTP from inside the Worker — `lib/email.ts`
  (policy + copy) on `lib/smtp.ts` (a small `node:tls` client, port 465
  implicit TLS). It's deliberately not a `cloudflare:sockets` library:
  OpenNext bundles the server with esbuild, which can't resolve that scheme
  and exposes no hook to mark it external, so such a library fails the
  build. Without `SUPPORT_EMAIL_APP_PASSWORD` the code is logged instead; use
  `npm run preview` to exercise a real send.
- Email change works without verification only while emails are
  unverified (`updateEmailWithoutVerification` in `lib/auth.ts`); a
  "taken" email reports success without changing anything, so the UI
  re-checks the session (see `EmailRow`).
- Unlink and password-less delete need a fresh (<24h) session — map 403s
  to a friendly "sign out and back in" message.
- Schema changes: edit `db/schema.ts`, then `npm run db:generate`,
  `npm run db:migrate:local`, and at deploy time
  `npm run db:migrate:remote` **before** `npm run deploy`.
- **D1 has no interactive transactions.** Drizzle's `transaction()` emits a
  raw `BEGIN`, which D1 rejects — use `db.batch([...])` for writes that must
  land together (see `createTeam` in `app/teams/actions.ts`).
- Two migration gotchas, both hit while adding teams: `drizzle-kit generate`
  asks whether a dropped + added column on one table is a rename (it needs a
  TTY — split the change into two generates if you can't answer), and its
  table-rebuild output uses `PRAGMA foreign_keys`, which D1 refuses. Swap that
  for `PRAGMA defer_foreign_keys=on` (see `drizzle/0004_*.sql`). SQLite also
  won't `ADD` a `NOT NULL` column without a default.

## Verifying changes

`npm run lint` && `npm run build`, then `npm run dev` (:3000) for the
fast loop or `npm run preview` (:3999) for the production-like Workers
runtime. Discord flows need `DISCORD_CLIENT_ID/SECRET` in `.dev.vars`;
verification codes print to the terminal without
`SUPPORT_EMAIL_APP_PASSWORD`.
Inspect local D1 with
`wrangler d1 execute website-sql --local --command "SELECT …"`.
