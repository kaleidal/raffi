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

### Import Convex snapshot into D1 (one-time)

Use this when you have a Convex export and want to backfill D1 data in one pass.
The default behavior imports all `user_id` values found in the snapshot so every user in the export is imported.

```bash
bun run import:convex
```

By default it reads `snapshot.zip` and writes `scripts/convex-import.sql`.

Works with both zip and extracted folders:

```bash
bun run import:convex -- --input snapshot.zip --apply --db raffi-sync --out scripts/convex-import.sql
```

```bash
bun run import:convex -- --input /path/to/snapshot-folder --apply --db raffi-sync --out scripts/convex-import.sql
```

Useful flags:

- `--input PATH` custom snapshot file or folder.
- `--db NAME` Wrangler D1 database name (default `raffi-sync`).
- `--user-id ID` force all rows to one target user id (optional). Use when you want to restore into a single account.
- `--out PATH` custom SQL output path.
- `--apply` execute the generated SQL with `wrangler d1 execute`.
- `--local` execute against local D1 bindings.
- `--no-replace` skip deleting existing rows for matching user ids before import.

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
