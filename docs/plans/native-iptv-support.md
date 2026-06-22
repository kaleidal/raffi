# Native IPTV Support Implementation Plan

> **For Hermes:** Hand this plan to Codex on the Fedora desktop. Use strict TDD for parser/store code, keep Codex changes in `feature/native-iptv`, then Hermes must review diffs and run the verification commands before declaring success.

**Goal:** Add first-class native IPTV support to Raffi desktop: users can add a Dispatcharr/M3U playlist URL plus optional XMLTV EPG URL, browse/search live channels by group, see now/next guide data, and play a channel in Raffi's existing player.

**Architecture:** Add a small IPTV domain under `packages/app/src/lib/iptv/` for parsing, guide matching, source persistence, and fetch orchestration. Add a `live` route/page under `packages/app/src/pages/live/LiveTV.svelte` that uses the domain code and routes selected channels into the existing `Player.svelte` via `videoSrc`. Add a desktop Electron IPC fetch helper so M3U/XMLTV URLs work despite CORS; web builds can fall back to `fetch` and show a clear CORS error if blocked.

**Tech Stack:** Svelte, TypeScript, Bun workspaces, Electron IPC, built-in `bun test` for pure parser/store tests, `svelte-check` via existing scripts.

---

## Current repo facts

- Repo path on Fedora: `/home/mike/src/raffi`
- Branch for this work: `feature/native-iptv`
- Baseline check already passed on Fedora:
  - `bun install --frozen-lockfile`
  - `bun run check:app` → `0 errors, 0 warnings`
- Fedora has `bun 1.3.14`, `node v24.16.0`, `codex-cli 0.141.0`.
- Fedora does **not** currently have `go`; avoid Go/server changes unless absolutely necessary for playback.

## Dispatcharr test endpoints

Use these for live smoke testing. Do not commit downloaded playlist/EPG data. Do not print full M3U contents or stream URLs in logs.

```text
M3U:   http://192.168.10.3:9191/output/m3u/Live-TV
XMLTV: http://192.168.10.3:9191/output/epg/Live-TV
HDHR:  http://192.168.10.3:9191/hdhr/Live-TV/lineup.json
```

Verified from Fedora:

```text
/output/m3u/Live-TV  -> HTTP 200, ~144604 bytes, 586 #EXTINF channels
/output/epg/Live-TV  -> HTTP 200, ~40936152 bytes, ~55508 <programme> entries
/output/m3u          -> HTTP 200, 605 channels
/output/epg          -> HTTP 200, ~55850 programmes
```

Old profile name `Test` is stale: `/output/m3u/Test` returned 404 and `/output/epg/Test` returned an empty response.

Dispatcharr M3U stream URLs are local proxy URLs shaped like:

```text
http://192.168.10.3:9191/proxy/ts/...
```

These are MPEG-TS-style live streams, not simple static files. Route them to the existing Raffi player first; only touch lower-level playback if the player cannot handle them.

---

## Acceptance criteria

1. `Live TV` is reachable from the home/search bar UI and via `router.navigate("live")`.
2. User can add/edit/remove at least one IPTV source with:
   - source name
   - M3U URL
   - optional XMLTV URL
3. Source config is persisted locally, but raw playlist/EPG bodies are not persisted to `localStorage`.
4. Refreshing the Dispatcharr `Live-TV` source loads ~586 channels without leaking full URLs to console.
5. Channel list supports:
   - group filter
   - text search
   - channel logo if present
   - channel name
   - now/next programme when XMLTV match exists
6. XMLTV matching order:
   - `tvg-id`
   - `tvg-name`
   - normalized display name fallback
7. Clicking a channel opens the existing player with `videoSrc = channel.url` and a live-mode title/metadata.
8. Player live mode avoids movie/series behaviors: no Trakt progress/scrobble, no next episode, no intro skip, no resume progress writes.
9. Error states are human-readable: invalid URL, fetch/CORS failure, empty playlist, XMLTV parse failure, no source configured.
10. Verification commands pass:
    - `bun test packages/app/src/lib/iptv/*.test.ts`
    - `bun run check:app`
    - `bun run check:desktop`
11. Dispatcharr smoke command succeeds without printing playlist secrets:
    - fetch M3U and XMLTV through the implemented fetch path if possible, or via a small dev-only smoke script
    - report counts only: channel count, group count, programme count, now/next match count sample

---

## Task 1: Add IPTV types and M3U parser tests

**Objective:** Define the data model and lock parser behavior before implementation.

**Files:**
- Create: `packages/app/src/lib/iptv/types.ts`
- Create: `packages/app/src/lib/iptv/m3u.test.ts`
- Create: `packages/app/src/lib/iptv/m3u.ts`

**Step 1: Write failing tests first**

Create tests for at least:

```ts
import { describe, expect, test } from "bun:test";
import { parseM3U } from "./m3u";

describe("parseM3U", () => {
  test("parses EXTINF attributes and following stream URL", () => {
    const playlist = `#EXTM3U\n#EXTINF:-1 tvg-id="abc.us" tvg-name="ABC" tvg-logo="http://logo/abc.png" group-title="Local",ABC HD\nhttp://192.168.10.3:9191/proxy/ts/channel-1\n`;
    const result = parseM3U(playlist, "source-1");
    expect(result.channels).toHaveLength(1);
    expect(result.channels[0]).toMatchObject({
      sourceId: "source-1",
      tvgId: "abc.us",
      tvgName: "ABC",
      logo: "http://logo/abc.png",
      group: "Local",
      name: "ABC HD",
      url: "http://192.168.10.3:9191/proxy/ts/channel-1",
    });
  });

  test("keeps provider order and handles missing attributes", () => {
    const playlist = `#EXTM3U\n#EXTINF:-1,One\nhttp://one\n#EXTINF:-1 group-title="News",Two\nhttp://two\n`;
    const result = parseM3U(playlist, "source-1");
    expect(result.channels.map((c) => c.name)).toEqual(["One", "Two"]);
    expect(result.channels[0].group).toBe("Ungrouped");
    expect(result.groups.map((g) => g.name)).toEqual(["Ungrouped", "News"]);
  });
});
```

Run and verify RED:

```bash
bun test packages/app/src/lib/iptv/m3u.test.ts
```

Expected before implementation: fail because `parseM3U` does not exist.

**Step 2: Implement minimal parser**

Suggested types:

```ts
export type IptvSourceKind = "m3u";

export interface IptvSource {
  id: string;
  name: string;
  kind: IptvSourceKind;
  m3uUrl: string;
  epgUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IptvChannel {
  id: string;
  sourceId: string;
  name: string;
  url: string;
  group: string;
  tvgId?: string;
  tvgName?: string;
  logo?: string;
  number?: string;
  order: number;
}

export interface IptvGroup {
  id: string;
  sourceId: string;
  name: string;
  channelCount: number;
  order: number;
}
```

Implementation notes:
- Parse `#EXTINF` attributes with a quote-aware regex: `/([\w-]+)="([^"]*)"/g`.
- Channel display name is the text after the comma; fallback to `tvg-name`, then URL.
- Default group: `Ungrouped`.
- Stable channel id can be `${sourceId}:${order}:${normalizedName}` for now.
- Skip entries with missing URL.

**Step 3: Verify GREEN**

```bash
bun test packages/app/src/lib/iptv/m3u.test.ts
```

---

## Task 2: Add XMLTV parser and guide matcher with tests

**Objective:** Parse enough XMLTV to show now/next for large Dispatcharr EPG data without building a full guide grid yet.

**Files:**
- Create: `packages/app/src/lib/iptv/xmltv.test.ts`
- Create: `packages/app/src/lib/iptv/xmltv.ts`

**Step 1: Write failing tests**

Test small XMLTV with two channels and multiple programmes. Include timezone-style XMLTV times like `20260622090000 -0400`.

Required exported functions:

```ts
parseXmltv(xml: string): XmltvGuide
getNowNext(channel: IptvChannel, guide: XmltvGuide, at?: Date): { now: XmltvProgramme | null; next: XmltvProgramme | null }
```

Test matching by:
- exact `tvg-id` to XMLTV `channel id`
- `tvg-name` to channel display-name fallback
- normalized channel name fallback

**Step 2: Implement minimal XMLTV support**

Suggested types:

```ts
export interface XmltvProgramme {
  channelId: string;
  start: Date;
  stop: Date;
  title: string;
  subTitle?: string;
  description?: string;
}

export interface XmltvChannel {
  id: string;
  displayNames: string[];
}

export interface XmltvGuide {
  channels: Map<string, XmltvChannel>;
  programmesByChannel: Map<string, XmltvProgramme[]>;
  displayNameToChannelId: Map<string, string>;
}
```

Implementation notes:
- For testability, pure functions only.
- DOMParser is available in browser but not Bun. For tests, prefer a lightweight parser based on regex helpers or add a local `parseXmltvTime` plus extraction functions that work in Bun.
- Decode common XML entities for titles/descriptions.
- Sort programmes by start time per channel.
- Keep MVP to current/next; do not build grid UI yet.

**Step 3: Verify GREEN**

```bash
bun test packages/app/src/lib/iptv/xmltv.test.ts
```

---

## Task 3: Add IPTV source store and fetch abstraction

**Objective:** Persist source config and fetch M3U/XMLTV text through a CORS-safe desktop path.

**Files:**
- Create: `packages/app/src/lib/iptv/store.ts`
- Create: `packages/app/src/lib/iptv/fetch.ts`
- Modify: `apps/desktop/electron/preload.cjs`
- Modify: `apps/desktop/electron/services/mainIpc.cjs`
- Optionally modify: `packages/app/src/lib/platform.ts` types if needed.

**Store requirements:**
- localStorage key: `raffi_iptv_sources_v1`
- exported Svelte store: `iptvSources`
- helpers: `addIptvSource`, `updateIptvSource`, `removeIptvSource`, `getStoredIptvSources`
- validate URL scheme: only `http:`/`https:` for URL sources
- do not store fetched M3U/XMLTV bodies

**Fetch requirements:**
- In desktop, use `window.electronAPI.iptvFetchText(url, { timeoutMs, maxBytes })`.
- In web fallback, use `fetch(url)` and surface a message if CORS blocks it.
- Max bytes default: at least 64 MiB because Dispatcharr XMLTV is ~41 MiB.
- Timeout default: 60 seconds for XMLTV, 20 seconds for M3U.
- Never log response bodies.

**Electron IPC sketch:**

`preload.cjs`:

```js
iptvFetchText: (url, options) => ipcRenderer.invoke('IPTV_FETCH_TEXT', { url, options }),
```

`mainIpc.cjs` handler:

```js
ipcMain.handle("IPTV_FETCH_TEXT", async (_event, payload) => {
  const target = String(payload?.url || "").trim();
  const parsed = new URL(target);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only http/https IPTV URLs are supported");
  const timeoutMs = Math.min(Math.max(Number(payload?.options?.timeoutMs) || 30000, 1000), 120000);
  const maxBytes = Math.min(Math.max(Number(payload?.options?.maxBytes) || 64 * 1024 * 1024, 1024), 128 * 1024 * 1024);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(target, { signal: controller.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`Fetch failed with HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) throw new Error("IPTV response exceeded maximum size");
    return { ok: true, status: res.status, text: Buffer.from(arrayBuffer).toString("utf8") };
  } finally {
    clearTimeout(timer);
  }
});
```

Use `logToFile` only for metadata (`host`, `status`, byte count), never full URL query secrets or bodies.

---

## Task 4: Build refresh orchestration

**Objective:** Given a source, fetch/parse M3U and optional XMLTV into page state.

**Files:**
- Create: `packages/app/src/lib/iptv/refresh.ts`
- Create: `packages/app/src/lib/iptv/refresh.test.ts`

**Behavior:**

```ts
refreshIptvSource(source: IptvSource): Promise<IptvRefreshResult>
```

Returns:
- `channels`
- `groups`
- optional `guide`
- `loadedAt`
- `stats` with channel count, group count, programme count
- friendly error messages

Test by injecting fake fetchers so pure tests do not hit Dispatcharr.

---

## Task 5: Add Live TV route and UI shell

**Objective:** Make a first-class Live TV page that can show source setup and loaded channel data.

**Files:**
- Modify: `packages/app/src/lib/stores/router.ts`
- Modify: `packages/app/src/App.svelte`
- Create: `packages/app/src/pages/live/LiveTV.svelte`
- Create optional components under `packages/app/src/pages/live/components/`:
  - `IptvSourceForm.svelte`
  - `LiveChannelList.svelte`
  - `LiveGroupFilter.svelte`
  - `LiveProgramBadge.svelte`

**Route changes:**

```ts
export type Route = "home" | "meta" | "player" | "lists" | "live";
```

`App.svelte` imports and maps `live: LiveTV`.

**UI behavior:**
- If no sources: show setup form.
- If sources exist: show source selector, Refresh button, group filter, search input, channel list.
- Add a `Use Dispatcharr example` helper only in development or as a subtle button that fills fields; do not hardcode it as the only source.
- Display counts and refresh time.
- Show errors inline.

Default Dispatcharr helper values for this user's testing:

```text
name: Dispatcharr Live-TV
m3uUrl: http://192.168.10.3:9191/output/m3u/Live-TV
epgUrl: http://192.168.10.3:9191/output/epg/Live-TV
```

---

## Task 6: Add navigation entry from home search bar

**Objective:** User can open Live TV from the existing top-right button cluster.

**Files:**
- Modify: `packages/app/src/components/home/SearchBar.svelte`

**Implementation:**
- Import a suitable icon from `@lucide/svelte`, e.g. `Tv`.
- Add `openLiveTv()`:

```ts
function openLiveTv() {
  trackEvent("live_tv_opened", { source: "search_bar" });
  router.navigate("live");
}
```

- Add button near Lists:

```svelte
<button ... aria-label="live tv" onclick={openLiveTv}>
  <Tv size={40} strokeWidth={2} color="#C3C3C3" />
</button>
```

---

## Task 7: Route channel playback into existing Player live mode

**Objective:** Clicking a live channel starts playback without movie/series side effects.

**Files:**
- Modify: `packages/app/src/pages/live/LiveTV.svelte`
- Modify: `packages/app/src/pages/player/Player.svelte`
- Modify: `packages/app/src/pages/player/types.ts` if needed
- Modify: `packages/app/src/pages/player/playerAnalytics.ts` if needed

**Navigation from Live TV:**

```ts
router.navigate("player", {
  videoSrc: channel.url,
  startTime: 0,
  metaData: null,
  fileIdx: null,
  season: null,
  episode: null,
  liveMode: true,
  liveChannel: {
    name: channel.name,
    group: channel.group,
    logo: channel.logo,
    tvgId: channel.tvgId,
    programmeTitle: nowNext.now?.title ?? null,
  },
});
```

**Player requirements:**
- Add exported prop `liveMode = false` and optional `liveChannel`.
- If `liveMode`, do not call progress persistence/scrobble paths.
- If `liveMode`, suppress skip intro and next episode affordances.
- Loading/error UI should identify the live channel name if available.
- Do not break existing file/movie/series playback.

---

## Task 8: Add Dispatcharr smoke script or command

**Objective:** Prove real user M3U/XMLTV can be parsed without committing private data.

**Files:**
- Create: `scripts/smoke-iptv-dispatcharr.mjs` or document command in `docs/plans/native-iptv-support.md`.

**Command behavior:**
- Fetch M3U URL and XMLTV URL from env vars:

```bash
IPTV_M3U_URL="http://192.168.10.3:9191/output/m3u/Live-TV" \
IPTV_EPG_URL="http://192.168.10.3:9191/output/epg/Live-TV" \
bun scripts/smoke-iptv-dispatcharr.mjs
```

- Import parser functions from built TS if easy; otherwise keep smoke logic minimal and only verify counts.
- Output only counts, e.g.:

```json
{
  "m3uStatus": 200,
  "channelCount": 586,
  "groupCount": 42,
  "epgStatus": 200,
  "programmeCount": 55508,
  "nowNextMatchesInFirst50": 37
}
```

Never print stream URLs or raw playlist lines.

---

## Task 9: Verification

Run in this order from `/home/mike/src/raffi`:

```bash
bun test packages/app/src/lib/iptv/*.test.ts
bun run check:app
bun run check:desktop
IPTV_M3U_URL="http://192.168.10.3:9191/output/m3u/Live-TV" \
IPTV_EPG_URL="http://192.168.10.3:9191/output/epg/Live-TV" \
bun scripts/smoke-iptv-dispatcharr.mjs
```

If `check:desktop` fails only because of pre-existing desktop issues, capture exact output and rerun `bun run check:app`; do not claim desktop verification passed.

Optional manual run after automated checks:

```bash
bun run dev:desktop
```

Manual test steps:
1. Open Live TV from the new TV button.
2. Add source `Dispatcharr Live-TV` with the M3U/XMLTV URLs above.
3. Refresh.
4. Confirm channel count is around 586.
5. Search for a known common channel.
6. Click a channel.
7. Confirm player opens and attempts playback.
8. Confirm no raw playlist/EPG data is printed to console/logs.

---

## Commit guidance

Make small commits if practical:

```bash
git add packages/app/src/lib/iptv
 git commit -m "test: add IPTV parser coverage"

git add packages/app/src/lib/iptv apps/desktop/electron
 git commit -m "feat: add IPTV source fetch and parsing"

git add packages/app/src/pages/live packages/app/src/lib/stores/router.ts packages/app/src/App.svelte packages/app/src/components/home/SearchBar.svelte packages/app/src/pages/player
 git commit -m "feat: add native live TV page"

git add scripts/smoke-iptv-dispatcharr.mjs docs/plans/native-iptv-support.md
 git commit -m "test: add Dispatcharr IPTV smoke check"
```

Codex may combine commits if needed, but final tree must be clean except intended changes.
