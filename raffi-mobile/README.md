# Raffi Mobile

Raffi Mobile is the Expo client for phones, tablets, and Android TV. It uses Ave authentication with Convex-backed sync for addons, library state, lists, and watch progress.

## Features

- Browse movies and series from Cinemeta and installed Stremio-compatible addons.
- Continue watching with shared progress across signed-in devices.
- Search, detail pages, source selection, and native playback.
- Android TV launcher support with a D-pad-first home, search, and details flow.
- Direct HTTP and debrid stream playback on supported platforms.
- On-device Android torrent streaming through the bundled native torrent module.

## Requirements

- Bun
- Node.js 18+
- Android Studio and Android SDK for Android builds
- Xcode for iOS builds

## Development

Install dependencies:

```bash
bun install
```

Start Expo:

```bash
bun run start
```

Run a native development build:

```bash
bun run android
bun run ios
```

Expo Go is not enough for torrent playback because the app includes native Android streaming code.

## Android TV

Android TV devices launch into the TV interface automatically through React Native TV detection. The TV route uses full-width focusable rows, a focused hero action area, and an inline source list designed for D-pad navigation.

The Android native project receives Leanback launcher metadata and a TV banner during prebuild through the app config plugin. To regenerate the native Android project:

```bash
bunx expo prebuild --platform android
```

Build a debug APK:

```powershell
cd android
.\gradlew.bat :app:assembleDebug
```

## Streaming

Stremio stream addons provide the available sources. Raffi prioritizes debrid/direct HTTP streams first, then higher-resolution and healthier peer-backed torrent streams.

On Android, magnet and info-hash sources are handled locally by `modules/torrent-streamer`, which starts a loopback HTTP stream for the player. On iOS, use debrid/direct HTTP sources.

## Project Structure

```text
app/                  Expo Router screens
app/(tabs)/           Phone and tablet tab interface
app/tv.tsx            Android TV home
app/tv-search.tsx     Android TV search
app/tv-meta/[id].tsx  Android TV details and source selection
app/player.tsx        Shared player
components/home/      Phone home sections
components/tv/        TV-focused controls and rows
lib/api.ts            Cinemeta and addon API helpers
lib/db.ts             Convex-backed app data access
lib/stores/           Zustand auth, library, addons, and downloads state
lib/torrent/          JavaScript interface for native torrent streaming
modules/torrent-streamer/ Native Android torrent streaming module
plugins/              Expo config plugins for native project generation
```

## Checks

Run these before handing off changes:

```bash
bun run lint
bunx tsc --noEmit
```
