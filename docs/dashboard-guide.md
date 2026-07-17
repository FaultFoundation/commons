# Dashboard Guide

How the member dashboard is built and how to extend it without breaking
anything. The core ideas:

- **Everything is a bubble.** Tabs have no page titles — each tab is a
  `.ff-bubble-grid` of `Bubble` cards (plus an invisible
  `screen-reader-text` h1 for accessibility). Think CarPlay: each tab is
  its own thing; the Home tab will eventually show condensed widget views
  of the other tabs.
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
- `span="full"` — spans the whole grid row (use for Danger Zone-style
  footers).
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

### `SetupStrip` — onboarding progress

`components/dashboard/SetupStrip.tsx`, rendered by `DashboardShell` on
every tab that passes `setupUserId`. Shows "Setup n/3" (Email ·
Battle.net · Discord) and unmounts once all three are done. Don't pass
`setupUserId` on pages that *are* a setup step (register). Battle.net
counts as done when `profiles.battleTag` is set — real OAuth is still
todo, so new users keep the strip until that ships.

## Recipe: add a new tab

1. Create `app/dashboard/<tab>/page.tsx` from this skeleton:

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
           <Bubble title="First Bubble">…</Bubble>
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

## Backend notes

- Account mutations (name/email/password/unlink/delete) are Better Auth
  client calls — no custom endpoints. Server actions
  (`app/dashboard/register/actions.ts`) exist only for domain logic
  Better Auth doesn't own.
- Email change works without verification only while emails are
  unverified (`updateEmailWithoutVerification` in `lib/auth.ts`); a
  "taken" email reports success without changing anything, so the UI
  re-checks the session (see `EmailRow`).
- Unlink and password-less delete need a fresh (<24h) session — map 403s
  to a friendly "sign out and back in" message.
- Schema changes: edit `db/schema.ts`, then `npm run db:generate`,
  `npm run db:migrate:local`, and at deploy time
  `npm run db:migrate:remote` **before** `npm run deploy`.

## Verifying changes

`npm run lint` && `npm run build`, then `npm run dev` (:3000) for the
fast loop or `npm run preview` (:3999) for the production-like Workers
runtime. Discord flows need `DISCORD_CLIENT_ID/SECRET` in `.dev.vars`;
registration codes print to the terminal without `RESEND_API_KEY`.
Inspect local D1 with
`wrangler d1 execute website-sql --local --command "SELECT …"`.
