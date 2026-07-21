# @raffi/web

SvelteKit + Cloudflare Pages implementation of Raffi.

This is a **first-class web target** that consumes the exact same `@raffi/app` package as the desktop app.

## Goals

- Fully browser-based
- Focused on **direct HTTP + debrid streams** (no torrent client)
- Shared UI (home, library via sync.raffi.al, meta, player)
- Graceful degradation: when something doesn't work well in browser, show clear "Use Desktop" messaging

## Current Status

- Mounts the real shared `App.svelte`
- Web platform shim
- Direct stream playback is the primary supported path

## Development

```bash
bun install   # from repo root
bun run dev:web
```

## Deployment

```bash
bun run build:web
bun --filter @raffi/web deploy
```

Target domain: **web.raffi.al**
