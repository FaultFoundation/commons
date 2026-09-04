# Dashboard Guide

How the member portal is built and how to extend it without breaking
anything.

## Routes

The portal lives at the top level (it used to sit under `/dashboard`, which
now 308s via `middleware.ts`). `/` stays the public Commons landing page.

| Route                          | Tab         | What                         |
| ------------------------------ | ----------- | ---------------------------- |
| `/home/`                       | Home        | Condensed widget views       |
| `/schedule/`                   | Schedule    | All/public + personal match calendar |
| `/tournaments/`                | Tournaments | List of open/live/finished tournaments |
| `/t/<id>/<name>/`              | —           | Public branded bracket (signed-out-safe) |
| `/admin/tournaments/`          | Admin       | Create + manage (Challonge-backed) |
| `/teams/`                      | Teams       | Your teams + create          |
| `/teams/<teamId>/`             | Teams       | One team: roster, invites, settings, tournaments. External (`provider:id`) ids render the read-only synced view |
| `/statistics/`                 | Statistics  | Player Data (Overwatch) + Match Data (cross-provider) tabs |
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
- **App-scale type.** The dashboard opts out of the marketing site's fluid
  clamp scale. Use the tokens below; never hardcode a font-size in dashboard
  CSS.

## Type scale

Defined on `.ff-dash` in `styles/theme.css`, so everything the shell
renders (tabs, register flow, dialogs) inherits them. Sizes below are at
Cozy; the whole scale is multiplied by `--ff-text-scale`, which the density
preset sets (see below):

| Token               | Size at Cozy  | Use for                              |
| ------------------- | ------------- | ------------------------------------ |
| `--ff-dash-text-xs` | 0.75rem / 12px | Locked notes, fine print            |
| `--ff-dash-text-sm` | 0.8125rem / 13px | Row labels, hints, setup strip, meta |
| `--ff-dash-text-md` | 0.9375rem / 15px | Body, values, inputs, buttons (the `.ff-dash` base) |
| `--ff-dash-text-lg` | 1.0625rem / 17px | Bubble titles                       |
| `--ff-dash-text-xl` | 1.375rem / 22px | Register step titles, empty states  |

The *ratios* are fixed — one multiplier moves the whole scale, so the tiers
can never drift apart. Need a new size? Don't. Pick the nearest token; only
extend the scale if a whole new tier of hierarchy appears, and document it
here.

## Density (spacing) scale

Same idea, same place: spacing *inside* a bubble is a token on `.ff-dash`, so
a member can pick how tightly the portal packs. **Never hardcode a padding or
gap inside a bubble** — use one of these, exactly as with the type scale.

| Token                    | Compact | Cozy (default)     | Comfortable        |
| ------------------------ | ------- | ------------------ | ------------------ |
| `--ff-text-scale`        | 0.92    | 1                  | 1.06               |
| `--ff-dash-leading`      | 1.4     | 1.5                | 1.55               |
| `--ff-bubble-pad`        | 10–12   | `clamp(16,2vw,20)` | `clamp(22,2.8vw,28)` |
| `--ff-bubble-head-gap`   | 5px     | 12px               | 17px               |
| `--ff-bubble-body-gap`   | 3px     | 8px                | 12px               |
| `--ff-row-pad-y/-x`      | 4 / 8   | 9 / 13             | 13 / 16            |
| `--ff-row-editor-gap`    | 5px     | 9px                | 12px               |
| `--ff-tile-pad`          | 8px     | 13px               | 16px               |
| `--ff-field-gap`         | 0.4em   | 0.65em             | 0.95em             |
| `--ff-reg-pad`           | 12–16   | `clamp(20,3vw,26)` | `clamp(26,3.6vw,34)` |
| `--ff-avatar-sm/md/lg`   | 22/32/42 | 28/40/56          | 32/44/60           |

What each token controls: `--ff-bubble-pad` the card's own padding,
`--ff-bubble-head-gap` header → body, `--ff-bubble-body-gap` row → row (and
disclosure bodies), `--ff-row-pad-*` `.ff-row` and `.ff-disclosure__summary`,
`--ff-tile-pad` `.ff-integration` and `.ff-actions__panel`, `--ff-field-gap`
`.ff-auth__field` **inside the dash only**, `--ff-reg-pad` the setup cards.

**Why the steps are this wide.** The first version moved every token by 2px
per preset and left type alone. Measured, that was a 6% page-height difference
between Compact and Cozy — the two were indistinguishable in use. Type is most
of a row's height, and a fixed-size avatar sets a floor under it, so a preset
has to move the card edges, the head→body gap, the type scale, the leading
*and* the avatars together. It now measures ~734 / 950 / 1122px for the same
Account page. If you retune, re-measure rather than eyeballing the CSS.

The gap *between* bubbles (`.ff-bubble-grid { gap: 20px }`) is deliberately
**not** a density token — that rhythm is fixed.

Three presets, selected by `data-density` on the `.ff-dash` element:
`compact`, `cozy` (the `.ff-dash` base — no override block, so an absent or
unknown value lands here), and `comfortable`.

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

## Button and control standard

Appearance communicates **semantics**, not visual variety. Use these existing
classes directly in server or client components:

| Look | Class | Use for |
| --- | --- | --- |
| Blue filled | `ff-btn` | The one primary command or commit in a context: Save, Create, Send, Confirm. Blue hover stays blue; it must not turn yellow. |
| White outline | `ff-btn ff-btn--outline` | Secondary, navigation, reveal, dismiss, copy, and non-mutating commands: Back, Cancel, Edit, Manage, Open. |
| Yellow selected | `aria-pressed="true"` / `aria-current="page"` on segmented controls or tabs | Current view/mode only. Yellow is state, never a submit button or hover color. |
| Red filled | `ff-btn ff-btn--danger` | The final destructive confirmation only, never the button that merely opens a confirmation dialog. |
| Provider brand | `ff-oauth--<provider>` | OAuth/connect buttons only, where provider guidelines override the application palette. |

Binary settings use `Switch`: neutral when off and blue when on. View choices
use `.ff-segment`/`.ff-segment__btn` or dedicated tabs, never a row of command
buttons. A control that becomes actionable may stay outline-and-disabled until
valid, then become blue. `ff-btn--soft` no longer exists; do not reintroduce a
second secondary treatment.

```tsx
<button className="ff-btn">Save</button>
<button className="ff-btn ff-btn--outline">Cancel</button>
<button className="ff-btn ff-btn--danger">Delete</button>
<div className="ff-segment" role="group" aria-label="View">
  <button className="ff-segment__btn" aria-pressed={view === "all"}>All</button>
</div>
```

For destructive work, the button that **opens** `ConfirmDialog` is outline;
only the dialog's final confirm sets `danger`. Primary hover remains blue.
Yellow is produced by `aria-pressed="true"` / `aria-current="page"`, not by a
command class.

### Schedule calendar

The first Schedule bubble is a month grid with **All Matches / Your Matches**
in its header. All Matches reads the public `cen-sql.ext_matches` projection;
Your Matches reads the member's lazily synced `website-sql.external_matches`
plus Commons tournament entries. Provider rows without an exact time belong in
Date TBD. Until the match projection has been populated by a schema-v4 scraper
run and imported, All Matches intentionally falls back to external tournament
start windows so the calendar degrades rather than disappearing.

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
- `media` — leading visual beside the title, for identity (a team logo). It
  belongs next to the name, not out in `actions` with the badges.
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
- `media` — leading visual (an `Avatar`, an icon) left of the label/value
  stack. The row grows a third grid column via `:has()`, so adding one is a
  pure JSX change.
- `action` — right-aligned control. Use `ff-btn--sm` inside rows, and follow
  the button convention below.
- `children` — an expanded editor area rendered full-width under the row.
  **Pass `undefined`, not an always-truthy fragment**, when there is nothing
  to show: the editor draws a top margin and a dashed rule for any truthy
  value, and `<>{null}{null}</>` is truthy.
- `field` — an editable control *instead of* the static value, which also
  re-lays the row out (label across the top, control beside its button). A
  block container rather than the value's `<span>`, because a `<form>` may not
  live inside phrasing content. See `FieldRow`.

### `FieldRow` — the always-editable row (client)

`components/dashboard/bubbles/FieldRow.tsx`. The portal's standard
single-value editor: a text field prefilled with what's stored, plus a Save
Changes button that stays disabled until the value actually differs.

```tsx
<FieldRow
  label="Username"
  value={initialName}          // "" when unset — never a placeholder em-dash
  placeholder="Your display name"
  maxLength={80}
  onSave={async (next) => { … }}   // error message, or null on success
/>
```

- `value` is what's stored. **Never pass `?? "—"`** — the field shows it
  verbatim, so a placeholder becomes real text the member has to delete.
  Use `?? ""` with a `placeholder`, and `required={false}` if it may be blank.
- `status` / `statusLabel` — a check or warning glyph inside the field's right
  edge. The label is the accessible text; the colour is never the only signal.
- `locked` / `lockTitle` — disabled input plus a lock glyph beside any
  `status`, for support-only values. The row keeps the **ordinary** field
  background, and the reason lives on the lock's hover rather than in a note
  under the field: several locked rows each repeating "contact support" was
  most of the card's height and none of its meaning.
- **Never pass `autoComplete` unless the field really is a credential.** It
  defaults to `"off"`, and the input also carries the password managers'
  opt-out attributes (`data-1p-ignore`, `data-lpignore`, `data-bwignore`,
  `data-form-type`). An `autoComplete="email"` here is enough to make a manager
  read the row as a sign-in form and offer to fill a login — on a page the
  member is already signed in to.
- `savedNote` — shown after a successful save until the field is edited again,
  for saves whose result isn't visible in the field (an email change lands in
  an inbox, not in the row).
- The `<form>` sits in the field slot and its submit button in the action
  slot, joined by `form={id}` — they're in different grid columns, so one
  can't wrap the other. Enter in the field submits that row alone.

This replaced an `InlineEditRow` that hid each value behind an Edit button.
Multi-field editors (`PasswordRow`, `TwoFactorRows`) are still written bespoke
on top of `BubbleRow`.

### `ConfirmDialog` — destructive confirmations (client)

Native `<dialog>`-based modal (`components/dashboard/bubbles/ConfirmDialog.tsx`).
The parent owns all state, including any input passed as children; Enter
confirms, Esc/Cancel closes. Use `danger` for red confirm buttons. See
`DeleteAccount.tsx` for the full pattern.

`AdminUnlockDialog` is the other modal in the portal. It is built on the same
native `<dialog>` shell but deliberately **not** on `ConfirmDialog`: there is no
Cancel/Confirm pair, the body is a form that owns its own submit and its own
"email me a code instead" links. When a modal's body needs to drive the action
row, copy the `<dialog>` shell rather than bending `ConfirmDialog` around it.

Note that a modal in the top layer still inherits CSS custom properties from its
DOM ancestors, so `--ff-dash-*` tokens resolve normally inside a dialog rendered
within `.ff-dash`. Top layer changes painting and stacking, not inheritance.

### `Disclosure` — collapsible row

`components/dashboard/bubbles/Disclosure.tsx`. Same shell as `BubbleRow`,
but the body expands on click. Native `<details>`, so no client directive
and it works without JS. The **progressive-disclosure** tool: keep a bubble to
the common case and tuck detailed knobs behind it (e.g. the tournament Game
Info bubble shows Format + a verification `Switch`, with best-of / swiss / third-
place inside an "Advanced" `Disclosure`). Prefer this and popups over a long
flat list of rows.

### `Switch` — on/off toggle (client)

`components/dashboard/bubbles/Switch.tsx`. A `role="switch"` toggle for booleans,
dropped into a `BubbleRow`'s `action` slot — the standard replacement for a
"Turn on / Turn off" button. The row carries the visible label; pass it as the
Switch's `label` for the accessible name. Accent when on.

```tsx
<BubbleRow label="Third-Place Match" note="Adds a 3rd/4th-place match."
  action={<Switch checked={on} onChange={(v) => apply({ thirdPlaceMatch: v })}
    label="Third-place match" />} />
```

### `useReorderableGrid` + `DragGrip` — draggable tiles

`components/dashboard/bubbles/useReorderableGrid.ts` + `DragGrip.tsx`, plus the
`Bubble` `dragHandle` slot. The reusable "drag a tile to reorder" template for
any `.ff-bubble-grid`: spread `bubbleProps(i)` onto each `Bubble` and pass
`<DragGrip {...handleProps(i)} />` as its `dragHandle`. A drag starts **only**
from the grip (bottom-right), so links/buttons on the card still work; keyboard
users reorder with the section's own up/down buttons. Adopt it per section (plus
a server reorder action); dropping the `dragHandle` hides the affordance.
Currently used by the Teams grid (`TeamCardGrid`).

### `Avatar` + `AvatarUploadRow` — pictures and logos

`components/dashboard/Avatar.tsx` renders a member's picture or a team's logo,
falling back to initials. **People are circles, teams are rounded squares**
(`shape="team"`) — the same distinction the cropper frames, so the upload
preview matches every place the image lands. Sizes are `sm` (roster rows),
`md` (cards, headers), `lg` (the upload row).

`AvatarUploadRow` is the picture row plus the crop popup, shared by the Account
tab and a team's settings. Cropping is `react-avatar-editor` (MIT, zero deps)
inside the existing `ConfirmDialog`, so Esc/focus-trapping come free; the
export is one `getImageScaledToCanvas().toBlob(…, "image/webp")` call, with no
hand-written crop math.

**Storage** is the `AVATARS` R2 bucket via `lib/avatars.ts`. Three rules matter:

- **Keys are content-addressed** — `user|team/<ownerId>/<sha256-16>.webp`. That
  is what lets `/api/avatars/*` serve `immutable`, but it also means a
  re-uploaded *identical* crop returns the key you already have. **Never delete
  the previous object without checking it differs from the new one**, or you
  delete the live image out from under the row. Both call sites guard this.
- **Bytes are sniffed, never trusted.** `sniffImageType` allows only PNG, JPEG
  and WebP magic numbers. **SVG is rejected outright** — these are served from
  our own origin, so an inline-script SVG would be stored XSS.
- **`user.image` is written by the *client*** (`authClient.updateUser`), not by
  the server action. Better Auth only invalidates its cached session on a
  client `/update-user` call, so a server-side write leaves the header avatar
  stale until the next full page load. The action does the R2 write and returns
  the URL; `AvatarRow` moves the pointer and only then discards the old object.

Team logos have no such constraint — `setTeamLogo` owns the object and the row
together, gated on `editSettings` like every other team setting.

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
   `FieldRow` / `ConfirmDialog`, call Better Auth via
   `authClient` (or a server action for domain logic), then
   `router.refresh()` so the server tree re-renders.
4. Keep the bubble self-contained: it must not care where in the grid it
   lives. That's what lets the Home board mount it (below) — the board hands a
   bubble its span, so a bubble that hardcodes its own placement can't be
   pinned.
5. If the bubble should be pinnable to Home, make it a **panel**: have it render
   its own `Bubble` and accept a `chrome` prop, then register it. See "The Home
   board" below for the contract and the checklist.

## The Home board (pinnable bubbles)

`/home/` is not a fixed page — it's a **board of the portal's own bubbles**, and
the member decides which ones are on it and in what order. A widget is **not** a
condensed re-implementation of a tab's card: it *is* that card, the same
component the tab mounts. That's the whole point of the panel contract below.

### The row rhythm

The board alternates a **full-width row** with a **two-column row**, repeating:

```
Row 1   [ ─────────── one full-width bubble ─────────── ]
Row 2   [ half bubble ] [ half bubble ]
Row 3   [ ─────────── one full-width bubble ─────────── ]
Row 4   [ half bubble ] [ half bubble ]
```

`isFullWidthAt(index, total)` in `lib/home-shared.ts` owns it: position `i` is
full when `i % 3 === 0`. **Position decides width, not the panel** — a member
dragging a tile up is also choosing to give it the full row. The one exception
is a trailing tile that would sit alone in a two-column row; it stretches
instead, so the board never ends on a half-empty row.

Because the rhythm is positional, order the default layout so genuinely *wide*
bubbles (the calendar, the tournament list) land on full-width indices — see
`DEFAULT_HOME_LAYOUT`.

### The panel contract — what makes a bubble pinnable

A **panel** is a bubble that renders its own `Bubble` (title, actions, body) and
accepts a `chrome` prop of the host's bubble-level props
(`components/dashboard/bubbles/PanelChrome.tsx`):

```tsx
// on its own tab — no chrome, the panel's own span/actions apply
<ResultsPanel past={past} anyConnected={anyConnected} />

// on the Home board — the board supplies span (from the rhythm), the drag
// grip and the reorder buttons
<ResultsPanel past={past} anyConnected={anyConnected} chrome={chrome} />
```

`mergeChrome(chrome, own)` merges the two: the host's `actions` render *before*
the panel's own (so a panel's controls stay rightmost), classNames concatenate,
and `span` is **overridden** by the host whenever chrome is present — on a tab
the panel's preference wins, on Home the rhythm decides.

Existing panels: `AccountPanels.tsx` (Profile / Security / Display /
Integrations), `ScheduleView.tsx` (`CalendarPanel`, `ResultsPanel`),
`TournamentsPanel`, `TeamsPanel`, `StatisticsPanels.tsx` (`OverwatchPanel`), and
`MatchPanel` (which takes `chrome` directly).

- **The registry is the single source of truth.** `lib/home-shared.ts`
  (`HOME_WIDGETS`, `DEFAULT_HOME_LAYOUT`, `asHomeLayout`) lists every bubble a
  member can pin, each with the `group` that sections the Customize popup and
  the `sources` it needs. `components/dashboard/home/HomeWidgets.tsx` maps a
  widget id to the real panel.
- **Only enabled widgets' data is fetched.** `app/home/page.tsx` →
  `loadHomeData` (`lib/home.ts`) reads the union of the enabled widgets'
  `sources` and nothing else. The board can now hold any bubble on the site, so
  fetching every tab's data up front stopped being affordable — it would mean a
  tournament list, a three-provider schedule sync and four Settings reads on
  every visit, for cards the member may not have pinned. Sources are shared: At a
  Glance + Calendar + Your Results all ride one `schedule` read. The trade-off is
  that *enabling* a widget needs a round-trip, which the Customize dialog does by
  reloading on close when the enabled set changed.
- **Panels must be client-bundle-safe.** `HomeBoard` is a client component, so
  everything a panel calls at runtime has to be free of db/cloudflare imports.
  This is why `discordServerNote` lives in `lib/integrations-shared.ts` and not
  in `lib/integrations.ts`. Types are fine (`import type` is erased); runtime
  values are not.
- **Persistence** is `profiles.home_layout` (a JSON array of widget ids) via
  `setHomeLayout` (`app/home/actions.ts`) — purely presentational, like
  `density`, so there's no capability to check and a tampered payload can at
  worst reorder/hide the caller's own widgets (`asHomeLayout` drops unknown
  ids). `[]` is a valid empty board.
- **Nested drag surfaces don't work.** The Teams *tab* is a grid of draggable
  team cards; pinning that grid inside the draggable board would leave two drag
  surfaces fighting for the pointer. `TeamsPanel` therefore renders the same
  `TeamCard`s read-only. If a tab's content is itself reorderable, the panel
  shows the result, not the controls.

**THE RULE — keep Home in sync.** A widget is never a copy of a tab's bubble; it
is the bubble. **When you add a bubble a member should be able to pin: extract
its body into a panel (if it isn't one), add an entry to `HOME_WIDGETS` with its
`group` + `sources`, load those in `lib/home.ts`, and render it in
`HomeWidgets.tsx`.** A new surface that isn't reachable from Home is an
incomplete change.

## Getting Started onboarding

`SetupBanner` (shell-owned) also mounts `GettingStartedDialog` — a large modal
(the 2FA-style native `<dialog>`, sized up to cover most of the screen) that
**auto-opens once a session** while any setup step is outstanding, so a fresh
sign-up lands in a guided checklist rather than a bare dashboard. It runs off the
**same single D1 read** the amber banner already does (academic verified /
Discord linked / on a team / entered a tournament), dismissal is a
`sessionStorage` flag, and the banner remains the persistent nudge afterward.
It's presentation only — every step's real gate is still server-side.

## Team roles

`team_members.role` is the permission tier — `manager | captain | coach |
player` — and `lib/teams-shared.ts` owns the whole model:

| Capability         | manager | captain | coach | player |
| ------------------ | :-----: | :-----: | :---: | :----: |
| `viewStats`        |    ✅    |    ✅    |   ✅   |   ✅    |
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
cards (`TeamCardGrid`); `/teams/<id>/` leads with a **hero** (`TeamHero`) then a
**single-column** `ff-bubble-grid--single` in priority order — Team Settings
(identity settings + the Invite Players disclosure), Roster, Tournaments, Danger
Zone. A team's region/timezone are prefilled at creation from the creator's
verified college (`getCollegeRegion`) and their browser zone, then edited through
dropdowns (`RegionRow` uses the same `schools` country list the registration form
does). The Tournaments bubble is the entry control — a manager/captain enters or
withdraws the team, which adds/removes it as a Challonge participant.

**Team cards + hero carry colour without a banner.** Both the `.ff-team-card`
grid tiles and the `TeamHero` header are dark bubbles accented with the team's
**chosen colour** — a top stripe and a ring on the logo, from `--team-accent`
(set inline from `teams.color`; `teamColor()` falls back to the brand blue). The
member picks it at sign-up and in Team Settings (`TeamColorPicker` — preset
swatches + a custom hex), and the game's **mark** (`GameSelect` →
`components/brand/GameLogo`) sits in the corner. Colour is member-chosen,
**not** game-derived — an earlier full game-tinted banner was dropped in favour
of this lighter accent. Cards stay draggable: `cursor: grab` lives on the
`.ff-drag-grip` alone, never the whole card, so a card only drags from its 9-dot
grip.

The **grid tile** (`TeamCard`) leads with two stacked stats — **Avg SR · Roster**
(uppercase label over value; the Tournaments *count* was dropped, but a team's
tournament names still list under the stats when it has any) — and repeats the
accent as a small **swatch** (`.ff-team-card__swatch`) beside the Copy Invite /
Manage row. The **hero** (single-team page) keeps the fuller strip (Roster · Avg
SR · Tournaments · Game). The Teams tab has **no page title**; instead a
collapsible **`.ff-teams-section` header** ("Active Teams" + a count badge)
labels and folds the grid — one group today, but the seam a future "Archived"
group hangs off. The grid is a uniform two-up `.ff-bubble-grid` (no full-width
"feature" first tile on this tab); the `TeamCard` `feature` prop still exists for
callers that want a spanning card. On the Teams tab the action row's **Start a
Team** is the filled blue primary (it commits a new team, per the blue rule)
while Find a Team / Looking for Players stay outline.

**Roster SR.** Each roster row shows the member's Overwatch SR with a tag saying
who reported it — **self-reported** vs **reported by a manager** — derived from
`team_members.skill_rating_by` compared to the member's own id, never a role name
inline. `setMemberSkillRating` gates on "self, or `manageRoster`", so a player
may report their own and a manager may report for the team; the team card and
hero show the roster's average.

## Tournaments (Challonge-backed)

The tournament backend is Challonge (API v2.1); the Commons renders a branded
front-end over it. See the CLAUDE.md "Tournaments run on Challonge" section for
the architecture (the `lib/challonge.ts` boundary, the snapshot cache seam, the
lazy TTL). Portal conventions specific to this surface:

- **Admin** (`/admin/tournaments/`, gated on `manageTournaments` + admin unlock):
  a create form (name/format/max entrants — also creates the Challonge
  tournament) and a per-tournament detail page. The detail page groups the same
  bubble vocabulary as the rest of the portal — Lifecycle (status transitions),
  Settings (only Challonge-honored fields: format, best-of, swiss rounds,
  third-place match, schedule), Seeding (a reorder list pushed to Challonge on
  Start), Bracket (Start button, then a per-match result-entry row), Danger Zone
  (reset/delete, both hitting Challonge). "Blue commits, outline doesn't" holds;
  reset/delete are `ff-btn--danger` behind a `ConfirmDialog`.
- **In-app view** (`/tournaments/<id>/`, inside `DashboardShell`): the member's
  landing when they click a tournament — a condensed info bubble, the bracket
  bubble (the same `BracketView`), then a two-column row of **Register** + a
  **Participants** list. Registration is here: a manager/captain picks one of
  their teams and enters. When the tournament has `academic_verification_required`
  on, a team with any unverified member can't enter and the row says how many
  need verifying (`listRegisterableTeams`); `enterTournament` re-checks it
  server-side (`listUnverifiedMembers`). Adding a team is one Challonge
  participant; withdrawing removes it.
- **Public bracket** (`/t/<id>/<name>/`): the signed-out **share** link (same
  `ff-bracket` layout) — no shell, no registration, polling
  `/api/tournaments/[id]/bracket` on the server-dictated interval (`nextPollMs`)
  and pausing on a hidden tab, the same request-budget discipline the ticket
  queue uses.
- **Challonge reconciliation** runs lazily when either tournament list is read,
  at most once per 24 hours. One paginated organization listing updates local
  names, formats, descriptions, dates, links and lifecycle states; a local row
  missing from a completely loaded listing is removed. `provider_synced_at` is
  the D1 lease that keeps simultaneous page views to one provider sync. Bracket
  participants and matches are a separate cache: 12 hours for open tournaments,
  30 days for concluded ones, plus immediate refresh after Commons admin writes.
- **Academic-verification toggle** is on the admin create form and the Game Info
  settings — it gates registration, nothing on Challonge.
- **The list** (`/tournaments/`, `TournamentList`) is all client-side over the
  one payload the server hands down: view tabs (All / Active / Concluded), a game
  filter, a card/compact layout toggle (cookie-persisted), and **pagination** —
  page numbers plus a per-page dropdown (12 / 24 / 48 / All) at the bottom
  (`PaginationBar`). Paginating in memory keeps a big catalog off Worker CPU;
  the page resets on any view/filter/size change and clamps so a shrinking list
  never strands the viewer on an empty page. The featured hero sits above the
  paged grid; Active card-view keeps older still-running events in a separate
  "Past tournaments" toggle. Cards show the **date + start time** (`startsAt`
  carries the full timestamp; midnight — i.e. date-only data — hides the time),
  and the list sorts by that full timestamp. External tournaments use the
  earliest scheduled match (`firstMatchAt` from the projection) as their start
  when the projection has match times, falling back to the tournament start.

## External player data (Teams + Statistics)

A member's external FACEIT / start.gg teams and their cross-provider match
history (FACEIT / start.gg / Challonge), synced into the `pd_*` tables of the
`ow-player-data` D1. See CLAUDE.md "Cross-provider player data" for the
architecture (the pure sync core, the poller mirror, the unbounded backfill);
portal conventions specific to these surfaces:

- **External team cards render inline** in `/teams/` after the member's
  internal cards, in the same `ff-team-card` vocabulary — the provider's glyph
  sits where an internal card shows the game mark
  (`.ff-team-card__gamechip--provider`), and the card opens
  `/teams/<percent-encoded provider:id>/` (the tournaments-tab id convention).
  They are deliberately **not reorderable**: the member's drag order belongs to
  internal teams (`reorderMyTeams` validates ids), and external order is the
  provider's.
- **The detail view** (`ExternalTeamView`) is read-only — identity bubble with
  a "View on FACEIT/start.gg" out-link, the provider's roster (provider
  handles, not Commons members), and the team's matches via the shared
  `MatchList`. Opening it requires the viewer's own `pd_team_links` row — a
  team you're not linked to is a 404, the internal-team rule.
- **Refresh is the ExternalTournamentRefresh pattern**: pages render from D1
  (never a provider call in a server render), then `PlayerDataAutoRefresh`
  fires the TTL-gated sync after paint and only a `changed: true` triggers
  `router.refresh()`. `PlayerDataRefreshButton` (the `ff-icon-btn` reload
  glyph, same as the Integrations recheck) sends `force: true`, which the
  server floors at 2 minutes.
- **Match Data** (`/statistics/`, second tab) fetches
  `/api/statistics/matches` behind the same `StatLoading` climbing bar as
  Player Data, and caches its last response in sessionStorage
  (stale-while-revalidate) so tab-hopping paints instantly. Per-provider sync
  problems render as `.ff-pd-problem` strips ("set your profile to public…",
  "usually temporary") — an inaccessible account is an explained state, never
  silently-missing data. The Battle.net connect gate lives INSIDE the Player
  Data panel so Match Data stays reachable without Battle.net.
- **Match rows** (`.ff-pdmatch`) are the shared vocabulary for external
  matches: provider mark · competition/sides/meta · result chip + score +
  out-link. Result chips (`.ff-pdmatch__result--win/loss/draw`) only render
  when the member's side is known; an unattributed match shows "A vs B" with
  no chip rather than guessing.

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
  build. `lib/email.ts` is one private `sendMail` plus a named sender per
  kind of message (school code, account-email link, two-factor code) — add
  new mail as another sender, not another SMTP call. Without
  `SUPPORT_EMAIL_APP_PASSWORD` the body is logged instead; use
  `npm run preview` to exercise a real send.
- **The account email is verified separately from the academic one.** The
  academic email proves a school affiliation; `user.emailVerified` is just
  "we can reach you here", and it matters because email 2FA codes go to that
  address. It's a link, not a code, because Better Auth mints and consumes
  the token itself at `/api/auth/verify-email`.
- `updateEmailWithoutVerification` is **false**: every email change is
  confirmed from the *new* address before it lands, so `EmailRow` reports
  "check your inbox" rather than showing a changed value. An address that
  already belongs to someone else takes the identical path and says the
  identical thing — that anti-enumeration behaviour is Better Auth's, and the
  UI must not try to distinguish the two.
- `requireEmailVerification` stays **false** — turning it on would lock out
  every member who registered before verification shipped.
- Unlink and password-less delete need a fresh (<24h) session — map 403s
  to a friendly "sign out and back in" message. Note that `setPassword`,
  `changeEmail` and `twoFactor.disable` use the *sensitive* session
  middleware instead, which re-reads the session authoritatively but has no
  freshness bar: those return 401, not 403.

### Two-factor authentication

`twoFactor` (Better Auth plugin, wired in `lib/auth.ts`) with the enrollment
UI in `components/dashboard/accounts/TwoFactorRows.tsx` and the sign-in step
in `components/auth/TwoFactorChallenge.tsx`.

- **One switch, two ways to satisfy it.** `user.two_factor_enabled` is whether
  a second factor is required; `two_factor.verified` is whether an
  authenticator app was ever proven. Enrolling *always* mints a TOTP secret,
  so email-only members have a `two_factor` row with `verified = 0`, and that
  is what makes the challenge offer email alone. Email codes need no per-member
  setup — they're available to anyone with 2FA on because `otpOptions.sendOTP`
  is configured server-side.
- **Enrollment order matters**: `enable({password})` returns the TOTP URI and
  backup codes but switches nothing on. The flag flips on the first successful
  `verifyTotp` or `verifyOtp`, so abandoning setup halfway leaves 2FA off
  rather than half-on.
- **Discord sign-in bypasses 2FA entirely.** The plugin only hooks
  `/sign-in/email`, `/sign-in/username` and `/sign-in/phone-number` — social
  sign-in never sees the challenge. Say so in the UI rather than implying
  cover we don't have. For the same reason **don't add the `email-otp`
  plugin**: `/sign-in/email-otp` isn't hooked either, so it would be a
  straight bypass for anyone holding the mailbox. Same caution before wiring
  `sendResetPassword`.
- **`emailVerification.autoSignInAfterVerification` must stay false** — it
  creates a session on link click, which is the same bypass by another route.
- `storeOTP: "hashed"` so a D1 read never yields a live code. Backup codes and
  the TOTP secret are encrypted with **BETTER_AUTH_SECRET — rotating it breaks
  every enrolled member's 2FA**, and no reset path exists.
- Backup codes are shown exactly once, at generation. There is no admin
  recovery tooling, so the sign-in challenge must always keep "use a backup
  code" reachable.
- QR codes come from `qrcode-generator` (MIT, zero dependencies) rendered as
  inline SVG in `QrCode.tsx`. Don't switch to its `createSvgTag()` — that
  returns an HTML string and would need `dangerouslySetInnerHTML`.
- Error copy for both the enrollment rows and the sign-in challenge lives in
  `lib/two-factor.ts`, so the two can't drift.
- Images live in the `AVATARS` R2 bucket, not D1 — see the `Avatar` section
  above. The bucket is private and served through `/api/avatars/*`, which puts
  `caches.default` in front of R2 so repeat hits cost no Class B operations.
  That API only exists in workerd, so `npm run preview` is the run that
  actually exercises it. Create the bucket before the first deploy:
  `npx wrangler r2 bucket create commons-avatars`.
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
