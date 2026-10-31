# @raffi/tv

Raffi for Android TV and Google TV devices such as the Chromecast with Google TV.

The app is a small Kotlin host around the shared `@raffi/app` interface. The interface runs in a WebView and is driven entirely by the remote; video plays natively underneath it.

## How it works

- **Interface**: the shared Svelte app is bundled into the APK and served from `https://tv.raffi.al` inside the WebView, so sync and addons treat it like the web app. Nothing is loaded from that address over the network.
- **Remote**: arrow keys move focus to the nearest item in that direction, OK activates it, and Back closes the open dialog, steps back a page, or leaves the app from Home. Text fields only raise the on-screen keyboard when OK is pressed on them.
- **Playback**: streams play through Media3 (ExoPlayer) on a surface beneath the transparent page, while the page draws the controls. MKV and MP4 play directly with hardware decoding, including HEVC and HDR where the device supports them, and Dolby audio passes through to the TV or receiver over HDMI. Embedded subtitles show up alongside addon subtitles, which are fetched only when picked.
- **Bridge**: the page and the host talk over `window.raffiTv`, a JSON message channel. The host also answers plain GET requests for the few services that don't allow browser origins.

Debrid and direct HTTP streams play today. Torrent streams and provider web players aren't supported on TV yet.

## Requirements

- Bun
- JDK 25
- Android SDK with platform 37 and build tools 37 (`ANDROID_HOME` pointing at it)

## Building

```bash
bun install            # from the repository root
bun run apk:tv         # builds the web bundle and a debug APK
```

The APK ends up at `android/app/build/outputs/apk/debug/app-debug.apk`.

## Installing on a TV

Turn on developer options on the TV (Settings → System → About, press Build seven times), enable USB or network debugging, then connect and install:

```bash
adb connect <tv-ip-address>
bun --filter @raffi/tv install:device
```

## Debugging

Debug builds allow Chrome DevTools to attach to the WebView. With the TV or an emulator connected over adb, open `chrome://inspect` in Chrome and pick the Raffi page.
