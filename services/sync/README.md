# Raffi Sync

Raffi Sync is the Cloudflare Worker API used by the desktop and mobile apps for account-backed cloud data.

Production apps use `https://sync.raffi.al` by default.

## Responsibilities

- Verify Ave ID tokens on every authenticated request.
- Store addons, library progress, lists, user settings, and Trakt connections in D1.
- Coordinate watch parties through Durable Objects.
- Provide Trakt OAuth exchange, refresh, client auth, and scrobble endpoints.

## Development

```bash
bun install
bun run types
bun run check
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
