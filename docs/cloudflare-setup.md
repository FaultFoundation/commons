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

### 4. Registration emails (Resend) + schools directory

The in-portal registration flow (school-email verification codes) needs two
one-time steps in production:

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

2. **Resend** (verification-code emails):
   1. Create a free account at <https://resend.com> → **Domains** → add
      `fault.foundation` → add the DKIM/SPF records it shows to Cloudflare
      DNS → wait for "Verified".
   2. Create an API key, then in the project terminal:
      ```sh
      npx wrangler secret put RESEND_API_KEY
      ```
   Until the key is set, codes are **logged to the Worker console instead
   of emailed** (`npx wrangler tail commons` shows them) — fine for testing,
   not for members. The from-address is the `EMAIL_FROM` var in
   `wrangler.jsonc`.

## Later / optional

- **Email verification:** flip `requireEmailVerification` in `lib/auth.ts`
  once an email provider (e.g. Resend) can send the links.
- **Legacy member import:** the `profiles` table accepts the old
  verification sheet (rows may exist before a member registers; linked by
  Discord ID once they sign in with Discord).
- **Live logs:** `npx wrangler tail commons` streams production errors.
- **Nonprofit programs:** Cloudflare for Startups (nonprofit track) and
  Project Galileo — independent of everything above; usage fits the free
  tier either way.
