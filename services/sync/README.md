# Raffi Sync

Raffi Sync is the Cloudflare Worker API used by the desktop and web apps for account-backed cloud data.

Production apps use `https://sync.raffi.al` by default.

## Responsibilities

- Verify Ave ID tokens on every authenticated request.
- Store addons, library progress, lists, user settings, and Trakt connections in D1.
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

## Configuration

`wrangler.jsonc` declares the D1 binding and Durable Object binding. Set these values before deploying:

- `AVE_CLIENT_ID`
- `AVE_ISSUER`
- `TRAKT_REDIRECT_URI`

Set Trakt credentials as Worker secrets:

```bash
bunx wrangler secret put TRAKT_CLIENT_ID
bunx wrangler secret put TRAKT_CLIENT_SECRET
```

Desktop can override the API URL with `VITE_RAFFI_SYNC_URL`. Mobile can override it with `EXPO_PUBLIC_RAFFI_SYNC_URL`.
