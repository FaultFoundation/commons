# Discord & Blizzard OAuth — provider setup

The code is done. This is the click-through in the two developer portals, plus
where each value goes. Terminal commands run on your own computer (VS Code →
**Terminal → New Terminal**, inside this project folder).

Nothing here is destructive, and every value can be regenerated later.

## What you end up with

| Value | Local (`.dev.vars`) | Production | Secret? |
|---|---|---|---|
| `DISCORD_CLIENT_ID` | yes | `wrangler secret put` | yes |
| `DISCORD_CLIENT_SECRET` | yes | `wrangler secret put` | yes |
| `DISCORD_GUILD_ID` | yes | `wrangler.jsonc` → `vars` | **no** |
| `BATTLENET_CLIENT_ID` | yes | `wrangler secret put` | yes |
| `BATTLENET_CLIENT_SECRET` | yes | `wrangler secret put` | yes |
| `DISCORD_BOT_TOKEN` | — | — | script-only, never stored |

Until Discord's two are set, the Discord row renders "Unavailable right now".
Same for Blizzard. Neither breaks anything else — email/password sign-in works
regardless.

---

# Part 1 — Discord

## 1.1 Pick the application

Go to <https://discord.com/developers/applications>.

**Reuse your existing verification bot's application if you have one.** It is
already in the server (step 1.4 becomes free), and one app means one name on
the consent screen and one place the Linked Roles metadata lives. Otherwise
**New Application** → name it something members will recognise on a consent
screen, e.g. `The Fault Foundation`.

## 1.2 Redirect URLs

Left sidebar → **OAuth2**. Under **Redirects**, **Add Another** for each of
these, exactly — no trailing slash:

```
http://localhost:3000/api/auth/callback/discord
http://localhost:3999/api/auth/callback/discord
https://commons.oscarlabit9729.workers.dev/api/auth/callback/discord
https://commons.fault.foundation/api/auth/callback/discord
```

**Save Changes.**

The first two are `next dev` and `npm run preview`. The last one won't work
until the custom domain is live (see `cloudflare-setup.md`), but registering it
now means the DNS cutover needs no portal visit.

> You do **not** configure scopes here. The app requests them at runtime — see
> `socialProviders.discord.scope` in `lib/auth.ts`. The OAuth2 URL Generator on
> this page is only for building invite links (step 1.4).

## 1.3 Copy the client id and secret

Still on **OAuth2**:

- **Client ID** — copy it. (This doubles as the Application ID; the Linked
  Roles endpoints are keyed on it, which is why there's no separate app-id var.)
- **Client Secret** → **Reset Secret** → copy. It is shown once.

## 1.4 Make sure the app is in your server

**Required for Linked Roles.** A role's requirement picker only lists apps that
are installed in that server. Skip this and step 1.9 will have nothing to
select.

If you reused the verification bot, it's already there — move on.

Otherwise: **OAuth2** → **OAuth2 URL Generator** → tick **`bot`** under scopes.
Leave every permission unchecked (this app needs none). Copy the generated URL
at the bottom, open it, choose your server, **Authorize**.

If the `bot` scope isn't offered, add a bot user first: left sidebar → **Bot** →
**Add Bot**.

## 1.5 Linked Roles verification URL

Left sidebar → **General Information** → **Linked Roles Verification URL**:

```
https://commons.fault.foundation/account/
```

**Save Changes.** Without this field set, the app never shows up as a role
requirement, no matter what metadata you register.

## 1.6 Bot token (for the one-time script only)

Left sidebar → **Bot** → **Reset Token** → copy.

This authenticates the metadata registration in step 1.8 and nothing else. It
is deliberately **not** a Worker secret — no request-time code path uses it.
Don't paste it into `.dev.vars`.

## 1.7 Server ID

In the Discord app (not the portal):

1. **User Settings** (gear, bottom-left) → **Advanced** → turn on **Developer Mode**.
2. Right-click your server in the left rail → **Copy Server ID**.

## 1.8 Fill in the values

Open `.dev.vars` and add:

```sh
DISCORD_CLIENT_ID=your-client-id
DISCORD_CLIENT_SECRET=your-client-secret
DISCORD_GUILD_ID=your-server-id
```

Then set `"DISCORD_GUILD_ID"` in `wrangler.jsonc` → `vars` (it's currently `""`)
to the same server id. It is a public identifier, not a secret.

For production secrets — each command waits for you to paste and press Enter:

```sh
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
```

## 1.9 Register the Linked Roles metadata

Once, with the bot token from 1.6 — inline on the command so it never lands in
a file:

```sh
DISCORD_CLIENT_ID=<client id> DISCORD_BOT_TOKEN=<bot token> \
  npm run discord:role-metadata
```

Expected output:

```
Registered 3 role-connection metadata records:
  verified_member (type 7)
  member_type (type 3)
  graduation_date (type 6)
```

This declares the *shape* — which keys exist and how a server may compare them.
Per-member values are pushed at runtime when someone verifies. Re-run it only if
you change the records in `scripts/register-role-metadata.mjs`.

### The three keys

| Key | Admin-facing name | Compare | Values |
|---|---|---|---|
| `verified_member` | Verified Member | is | `True` / `False` |
| `member_type` | Member Type | equals | `1` University student · `2` University alumnus · `3` High school student · `4` Guest |
| `graduation_date` | Graduates After | is after | a number of **days before today** (not a date — see below) |

Discord caps an application at **5** metadata records, which is why the member
types share one numeric key rather than taking a boolean each. That leaves two
slots spare. It also means an "any verified member" role is a single
requirement — Discord **ANDs** a role's requirements, so with four separate
booleans that role would have been impossible to express.

**The numbers are a contract.** Admins type them in by hand, so renumbering
later silently re-points every configured role at the wrong members. Only ever
append. `MEMBER_TYPE_IDS` in `lib/registration-shared.ts` is the source of truth.

`member_type` is `0` for anyone not verified, so a role gated on it already
implies verification — you don't need to also require Verified Member.

## 1.10 Create the roles in your server

For each role: **Server Settings** → **Roles** → **Create Role** → name it →
**Save** → **Links** tab → **Add requirement** → pick your app → set the
criterion.

| Role | Requirement |
|---|---|
| `@Verified` | Verified Member **is** True |
| `@College` | Member Type **equals** `1` |
| `@Alumni` | Member Type **equals** `2` |
| `@High School` | Member Type **equals** `3` |
| `@Guest` | Member Type **equals** `4` |
| `@Currently Enrolled` | Graduates After **is after** `0` days |

Members get a role once they've both linked Discord on the site and completed
verification — in either order.

Separating `@College` from `@High School` is worth doing early if minors are in
the server: it's the cheapest way to scope channels and DMs by age group.

**On `Graduates After`:** Discord's date requirements are configured as *a
number of days before today*, not as a calendar date — the member's graduation
date must fall on or after `today − N`. So `0` means "graduating today or
later", i.e. still enrolled. `365` would mean "still enrolled, or graduated
within the past year", which is the one to use if you want recent alumni
included in a division.

---

# Part 2 — Blizzard

Worth knowing before you start: this yields the member's **BattleTag and account
id, and nothing else**. Blizzard publishes no Overwatch API, so there are no
stats, rank, or match history to be had. The value is a *verified* BattleTag for
tournament rosters rather than a hand-typed one.

## 2.1 Create the client

Go to <https://develop.battle.net/access/clients> and sign in with a Battle.net
account. **Create Client**.

- **Client Name** — e.g. `Fault Foundation Commons`.
- **Redirect URLs** — one per line:

```
http://localhost:3000/api/auth/oauth2/callback/battlenet
http://localhost:3999/api/auth/oauth2/callback/battlenet
https://commons.oscarlabit9729.workers.dev/api/auth/oauth2/callback/battlenet
https://commons.fault.foundation/api/auth/oauth2/callback/battlenet
```

- **Service URL** / **Intended Use** — describe it plainly: linking a member's
  BattleTag to their Fault Foundation Commons account for collegiate Overwatch
  rosters.

> **Note the extra `/oauth2/` segment.** Battle.net has no built-in better-auth
> provider, so it runs through the generic-OAuth plugin, which uses a different
> callback path than Discord's. Copying Discord's path here is the single
> easiest mistake to make.

Blizzard requires HTTPS for real hosts but accepts plain `http://localhost` for
development, so the local entries are fine as written.

## 2.2 Copy the credentials and fill them in

The client page shows a **Client ID** and **Client Secret**. Add to `.dev.vars`:

```sh
BATTLENET_CLIENT_ID=your-client-id
BATTLENET_CLIENT_SECRET=your-client-secret
```

And for production:

```sh
npx wrangler secret put BATTLENET_CLIENT_ID
npx wrangler secret put BATTLENET_CLIENT_SECRET
```

There is no scope, region, or game setting to configure — the code requests
`openid`, which is all a BattleTag needs.

---

# Part 3 — Verify it works

```sh
npm run dev          # or: npm run preview  (production-like workerd, :3999)
```

Sign in, go to `/account/`, and check the **Integrations** bubble:

1. Both rows show a working button rather than "Unavailable right now". If not,
   the secrets aren't being read — restart the dev server, since `.dev.vars` is
   only loaded at startup.
2. **Link Discord** → the consent screen lists **four** things (see the table
   below). Approve → the row shows your Discord display name with a ✓.
3. The row's fine print should say whether you're in the server. If it says
   nothing at all, `DISCORD_GUILD_ID` isn't set.
4. **Connect** on Blizzard → approve → the row shows your BattleTag.
5. Confirm both landed:

```sh
npx wrangler d1 execute website-sql --local \
  --command "SELECT provider, external_id, handle, refreshed_at FROM platform_identities"
```

6. Verify an academic email, then check the member's Discord connection
   (**User Settings → Connections**) shows the Fault Foundation entry with
   *Verified Member*, with Member Type matching how they registered.

## What members see on the consent screen

Worth being able to answer, since the site publicly commits to data
minimization:

| Scope | Consent screen wording | Why |
|---|---|---|
| `identify` | access your username, avatar, banner | the actual account link |
| `email` | see your email address | Discord *sign-up* needs it — `user.email` is NOT NULL |
| `guilds.members.read` | know your member info in your servers | **only** our server; tells you who hasn't joined |
| `role_connections.write` | update its role connection for you | write-only, powers the verified-member roles |

Deliberately **not** requested: `guilds` (every server they're in) and
`connections` (every other account they've linked).

Because `role_connections.write` pushes a verified-student flag *to* Discord,
the published "Discord and Sharing Personal Information" post should mention
that outward push — it currently only describes collection.

---

# Troubleshooting

| Symptom | Cause |
|---|---|
| Row says "Unavailable right now" | Secrets missing or the dev server wasn't restarted after editing `.dev.vars`. |
| `Invalid OAuth2 redirect_uri` | The registered URL doesn't match byte-for-byte. Check the origin/port, and that Blizzard's has `/oauth2/` while Discord's does not. |
| Blizzard returns `email_is_missing` | Shouldn't happen — `getUserInfo` in `lib/auth.ts` synthesizes a reserved `.invalid` address precisely because Blizzard returns no email. If you see it, that function is returning `null` (the userinfo call failed). |
| `POST /api/auth/oauth2/link` → 404 | The Battle.net secrets aren't set, so the plugin isn't registered. |
| Your app isn't in the role requirement picker | Step 1.4 (app not in the server) or step 1.5 (no verification URL). |
| Consent screen shows only 2 scopes | Running an older build — the scopes come from `lib/auth.ts`, not the portal. |
| Discord handle looks stale | By design. It refreshes on page view once a week; the Discord ID is the real key. To force it, age the row: `UPDATE platform_identities SET refreshed_at = 0 WHERE provider = 'discord'`. |

Members who linked Discord *before* the extra scopes shipped keep the narrower
grant; the guild and Linked Roles calls detect this and skip rather than error.
Unlinking and relinking upgrades them.
