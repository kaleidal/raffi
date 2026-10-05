# Raffi Sync

Raffi Sync is the Cloudflare Worker API used by the desktop and web apps for account-backed cloud data.

Production apps use `https://sync.raffi.al` by default.

## Responsibilities

- Sign people in with a 6-digit code sent to their email, using Better Auth mounted at `/auth`.
- Verify short-lived session JWTs on every authenticated API request.
- Store accounts, addons, library progress, lists, user settings, and Trakt connections in D1.
- Store profile photos in R2 and serve them from `/avatars`.
- Resolve multi-device edits by update time, including timestamped deletion tombstones and per-episode progress merging.
- Coordinate watch parties through Durable Objects.
- Provide Trakt OAuth exchange, refresh, client auth, and scrobble endpoints.

## Development

```bash
bun install
bun run types
bun run check
bun run test
bun run dev
```

Apply D1 migrations locally:

```bash
bunx wrangler d1 migrations apply raffi-sync --local
```

Apply D1 migrations to Cloudflare:

```bash
bunx wrangler d1 migrations apply raffi-sync --remote
```

## Deployment

Cloudflare Workers Builds deploys `main` from `/services/sync` with `npx wrangler deploy`. Set the build variable `BUN_VERSION=1.4.2` so dependency installation uses a Bun version compatible with the workspace lockfile. Cloudflare's default Bun 1.2.15 rejects it during `bun install --frozen-lockfile`.

Include `/services/sync/*`, `/bun.lock`, `/package.json`, and `/bunfig.toml` in the build watch paths so shared dependency changes also trigger deployment. Keep the lockfile committed and apply any pending D1 migrations before deploying.

## Authentication

Clients sign in in three steps:

1. `POST /auth/email-otp/send-verification-otp` with `{ "email", "type": "sign-in" }` emails a code.
2. `POST /auth/sign-in/email-otp` with `{ "email", "otp" }` returns a long-lived session token. A new email creates an account.
3. `GET /auth/token` with `Authorization: Bearer <session token>` returns a JWT that expires after 15 minutes.

Every other endpoint expects `Authorization: Bearer <jwt>`. The Worker verifies JWTs against the signing keys in D1 and keeps them in memory, so authenticated requests don't need a database lookup. `GET /auth/get-session` returns the profile and also sends a fresh JWT in the `set-auth-jwt` response header. Names are updated with `POST /auth/update-user`, photos with `PUT` and `DELETE /profile/avatar`.

Accounts that signed in with Ave keep their user IDs. Until `AVE_ACCEPTED_UNTIL`, the API still accepts Ave ID tokens from older app versions, and `POST /auth/ave/handoff` swaps an Ave session for a Raffi session so updated apps stay signed in.

## Configuration

`wrangler.jsonc` declares the D1, R2, email, and Durable Object bindings, plus these variables:

- `BETTER_AUTH_URL`: public URL of the Worker, also used as the JWT issuer and audience
- `EMAIL_FROM`: sender address for sign-in codes, on a domain onboarded to Cloudflare Email Sending
- `TRUSTED_ORIGINS`: comma-separated origins allowed to call the sign-in endpoints from a browser
- `AVE_CLIENT_ID`, `AVE_ISSUER`, `AVE_ACCEPTED_UNTIL`: Ave sign-in handoff for older app versions
- `TRAKT_REDIRECT_URI`

Set secrets before deploying:

```bash
bunx wrangler secret put BETTER_AUTH_SECRET
bunx wrangler secret put TRAKT_CLIENT_ID
bunx wrangler secret put TRAKT_CLIENT_SECRET
```

For local development, create `.dev.vars`:

```bash
BETTER_AUTH_SECRET=<openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:8787
```

`wrangler dev` doesn't send email. It prints each sign-in code to the console instead.

Desktop and web can override the API URL with `VITE_RAFFI_SYNC_URL`.
