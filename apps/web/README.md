# @raffi/web

SvelteKit + Cloudflare Pages implementation of Raffi.

This is a **first-class web target** that consumes the exact same `@raffi/app` package as the desktop app.

## Goals (per original request)

- Fully browser-based
- Focused on **direct HTTP + debrid streams** (no torrent client)
- Beautiful shared UI (home, library via sync.raffi.al, meta, player)
- Installable as PWA
- Graceful degradation: when something doesn't work well in browser, show clear "Use Desktop" messaging

## Current Status

- Mounts the real shared `App.svelte`
- Web platform shim + PWA install prompt
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
