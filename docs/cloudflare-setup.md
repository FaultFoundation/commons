# Cloudflare setup — status and remaining dashboard steps

Terminal commands here run on your own computer (VS Code → **Terminal → New
Terminal**, inside this project folder) — never in the Cloudflare dashboard.

## Already done (2026-07-16)

- Wrangler authenticated (`npx wrangler login`).
- D1 database **`website-sql`** (`5268b495-2952-4570-bd37-295e9d452753`)
  wired into `wrangler.jsonc`; schema applied remotely
  (`npm run db:migrate:remote`) and locally (`npm run db:migrate:local`).
- `BETTER_AUTH_SECRET` set on the Worker (`wrangler secret put`).
- First manual deploy succeeded.

## Two Workers, two repos

The account runs one Worker per repo. Don't mix them up:

| Worker | Repo | workers.dev | Domain |
|---|---|---|---|
| `commons` | **this one** | <https://commons.oscarlabit9729.workers.dev> | `commons.fault.foundation` |
| `website` | the marketing-site repo | <https://website.oscarlabit9729.workers.dev> | `fault.foundation` |

`wrangler.jsonc` here is pinned to `"name": "commons"`. **Never point it at
`website`** — `npm run deploy` from this repo would overwrite the static site.

The D1 database is still named `website-sql`; that's a leftover name from
before the split, not a second database, and only the Commons Worker binds it.

Since the split, the `commons` Worker still carries the pre-split build — the
first deploy from this branch is what actually makes it the Commons.

## Manual deploy (any time)

```sh
npm run deploy
```

That's the whole thing — builds with OpenNext and uploads the `commons`
Worker. No dashboard involved.

## Remaining dashboard steps

### 1. Point commons.fault.foundation at the Worker

1. <https://dash.cloudflare.com> → **Workers & Pages** → click **commons**.
2. **Settings** tab → **Domains & Routes** → **+ Add** → **Custom domain**.
3. Enter `commons.fault.foundation` → **Add domain**.
4. Then set `vars.BETTER_AUTH_URL` in `wrangler.jsonc` to
   `https://commons.fault.foundation` and redeploy.

`fault.foundation` itself belongs to the separate marketing-site repo — don't
attach it here.

Sign-in works on the `BETTER_AUTH_URL` origin plus anything listed in
`lib/auth.ts` `trustedOrigins` (currently `commons.fault.foundation` and the
`commons` workers.dev alias, so the cutover above needs no code change). Any
other origin is rejected by the auth origin check with a 403.

### 2. Auto-deploy on push (Workers Builds)

1. **Workers & Pages** → **commons** → **Settings** tab → **Build** section.
2. Connect the GitHub repo `FaultFoundation/commons`. If GitHub asks, grant
   the Cloudflare Workers app access to that repo.
3. Set exactly:
   - **Branch:** `main`
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
   - **Version command:** `npx wrangler deploy`

   `npm run build` is `opennextjs-cloudflare build`, which emits
   `.open-next/worker.js` for the deploy step to upload. Do not point it at
   `next build` alone — that only writes `.next/`, and `wrangler deploy` then
   fails on the missing entry point.
4. Builds trigger on the **next push** to that branch — changing settings or
   branches never starts a build by itself. To test: push any commit, then
   watch **Workers & Pages → commons → Deployments** (each build shows logs
   there; a failed build's log says exactly why).

Only the `commons` Worker may be connected to this repo — if a second one
gets attached, its builds fight over the same repo.

### 3. Discord sign-in (optional — button stays hidden until done)

1. <https://discord.com/developers/applications> → your app (the
   verification bot works) → **OAuth2**.
2. Add redirect URLs:
   - `https://commons.fault.foundation/api/auth/callback/discord`
   - `https://commons.oscarlabit9729.workers.dev/api/auth/callback/discord`
   - `http://localhost:3999/api/auth/callback/discord` (local testing; also
     put the id/secret in `.dev.vars`)
3. In the project terminal:
   ```sh
   npx wrangler secret put DISCORD_CLIENT_ID
   npx wrangler secret put DISCORD_CLIENT_SECRET
   ```
   (each command waits for you to paste the value and press Enter)

### 4. Verification emails (Gmail SMTP) + schools directory

The academic-verification flow (`/account/setup`) needs two one-time steps in
production:

1. **Seed the schools directory** (university typeahead data):
   ```sh
   npm run db:migrate:remote   # if the 0001 migration isn't applied yet
   npm run db:seed:remote      # loads db/seed/schools.sql (~10k universities)
   ```
   Regenerate the directory any time with `npm run db:seed:generate`
   (pulls the latest Hipo university-domains-list dataset). It writes both
   `db/seed/schools.sql` and `public/schools.json`; commit and deploy both
   generated artifacts from the same run because the static typeahead uses the
   transient ids assigned by the SQL seed. For a refresh, regenerate, apply the
   remote seed, and deploy the Worker immediately afterward. The registration
   submit action rejects a stale directory selection rather than validating the
   wrong school.

2. **Gmail SMTP** (verification-code emails). `lib/email.ts` + `lib/smtp.ts`
   talk SMTP directly from the Worker over `node:tls` (the `nodejs_compat`
   flag), so no third-party email API is in the path.

   Mail is sent from **support@fault.foundation**, authenticating as that
   same Google account.

   1. On the `support@fault.foundation` Google account, turn on 2-Step
      Verification, then create an **App password** (Google Account →
      Security → App passwords). It's 16 characters.
   2. In the project terminal:
      ```sh
      npx wrangler secret put SUPPORT_EMAIL_APP_PASSWORD
      ```
      (the address itself is the non-secret `SUPPORT_EMAIL` var in
      `wrangler.jsonc` — only the password is a secret)

   Until it's set, codes are **logged to the Worker console instead of
   emailed** (`npx wrangler tail commons` shows them) — fine for testing, not
   for members.

   Things that bite:

   - **From address.** Because we send from the same address we authenticate
     as, Gmail leaves the `From` header alone and no alias setup is needed.
     If you ever point `EMAIL_FROM` at a *different* address, that address
     must first be a verified alias on the account (Gmail → Settings →
     Accounts and Import → **Send mail as**) or Gmail will silently rewrite
     the header back.
   - **Quota.** ~100–500 recipients/day on a consumer Gmail account, 2,000/day
     on Workspace. Past that Google rejects sends for up to 24 hours.
   - **Ports.** Workers block outbound port 25. We use 465 (implicit TLS),
     which is open and needs no STARTTLS upgrade. `lib/smtp.ts` assumes TLS
     from the first byte, so don't point `SMTP_PORT` at 587.
   - **Local testing.** Real sends need `npm run preview` (:3999, actual
     workerd) plus the values in `.dev.vars`. Under `npm run dev` the code is
     printed to the terminal instead.

## Later / optional

- **Email verification:** flip `requireEmailVerification` in `lib/auth.ts` and
  point Better Auth's sender at `lib/email.ts` to verify sign-up addresses too
  (today only academic emails get a code).
- **Legacy member import:** the `profiles` table accepts the old
  verification sheet (rows may exist before a member registers; linked by
  Discord ID once they sign in with Discord).
- **Live logs:** `npx wrangler tail commons` streams production errors.
- **Nonprofit programs:** Cloudflare for Startups (nonprofit track) and
  Project Galileo — independent of everything above; usage fits the free
  tier either way.
