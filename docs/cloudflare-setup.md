# Cloudflare setup — status and remaining dashboard steps

Terminal commands here run on your own computer (VS Code → **Terminal → New
Terminal**, inside this project folder) — never in the Cloudflare dashboard.

## Already done (2026-07-16)

- Wrangler authenticated (`npx wrangler login`).
- D1 database **`website-sql`** (`5268b495-2952-4570-bd37-295e9d452753`)
  wired into `wrangler.jsonc`; schema applied remotely
  (`npm run db:migrate:remote`) and locally (`npm run db:migrate:local`).
- `BETTER_AUTH_SECRET` set on the Worker (`wrangler secret put`).
- First manual deploy succeeded: <https://website.oscarlabit9729.workers.dev>

## Manual deploy (any time)

```sh
npm run deploy
```

That's the whole thing — builds with OpenNext and uploads the Worker
`website`. No dashboard involved.

## Remaining dashboard steps

### 1. Point fault.foundation at the Worker

Deleting/recreating the Worker detached the domain.

1. <https://dash.cloudflare.com> → **Workers & Pages** → click **website**.
2. **Settings** tab → **Domains & Routes** → **+ Add** → **Custom domain**.
3. Enter `fault.foundation` → **Add domain**. (Repeat for `www.fault.foundation`
   if it was attached before.)

Sign-in works on `https://fault.foundation` (the `BETTER_AUTH_URL` var in
`wrangler.jsonc`) and on the workers.dev staging URL, which is explicitly
trusted in `lib/auth.ts` `trustedOrigins`. Any other origin is rejected by
the auth origin check with a 403.

### 2. Auto-deploy on push (Workers Builds)

1. **Workers & Pages** → **website** → **Settings** tab → **Build** section.
2. Connect the GitHub repo `FaultFoundation/website`
   (if GitHub asks, grant the Cloudflare Workers app access to that repo).
3. Set exactly:
   - **Branch:** `login` (switch to `main` once this branch merges)
   - **Build command:** `npx opennextjs-cloudflare build`
   - **Deploy command:** `npx opennextjs-cloudflare deploy`
4. Builds trigger on the **next push** to that branch — changing settings or
   branches never starts a build by itself. To test: push any commit, then
   watch **Workers & Pages → website → Deployments** (each build shows logs
   there; a failed build's log says exactly why).

If any *other* Worker got created during the earlier connect attempts
(anything besides `website` in the Workers & Pages list), delete it —
otherwise its builds fight over the same repo.

### 3. Discord sign-in (optional — button stays hidden until done)

1. <https://discord.com/developers/applications> → your app (the
   verification bot works) → **OAuth2**.
2. Add redirect URLs:
   - `https://fault.foundation/api/auth/callback/discord`
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
   Regenerate the seed file any time with `npm run db:seed:generate`
   (pulls the latest Hipo university-domains-list dataset).

2. **Resend** (verification-code emails):
   1. Create a free account at <https://resend.com> → **Domains** → add
      `fault.foundation` → add the DKIM/SPF records it shows to Cloudflare
      DNS → wait for "Verified".
   2. Create an API key, then in the project terminal:
      ```sh
      npx wrangler secret put RESEND_API_KEY
      ```
   Until the key is set, codes are **logged to the Worker console instead
   of emailed** (`npx wrangler tail website` shows them) — fine for testing,
   not for members. The from-address is the `EMAIL_FROM` var in
   `wrangler.jsonc`.

## Later / optional

- **Email verification:** flip `requireEmailVerification` in `lib/auth.ts`
  once an email provider (e.g. Resend) can send the links.
- **Legacy member import:** the `profiles` table accepts the old
  verification sheet (rows may exist before a member registers; linked by
  Discord ID once they sign in with Discord).
- **Live logs:** `npx wrangler tail website` streams production errors.
- **Nonprofit programs:** Cloudflare for Startups (nonprofit track) and
  Project Galileo — independent of everything above; usage fits the free
  tier either way.
