# @raffi/tv

Raffi for Android TV and Google TV devices such as the Chromecast with Google TV.

The app is a small Kotlin host around the shared `@raffi/app` interface. The interface runs in a WebView and is driven entirely by the remote; video plays natively underneath it.

## How it works

- **Interface**: the shared Svelte app is bundled into the APK and served from `https://tv.raffi.al` inside the WebView, so sync and addons treat it like the web app. Nothing is loaded from that address over the network.
- **Remote**: arrow keys move focus to the nearest item in that direction, OK activates it, and Back closes the open dialog, steps back a page, or leaves the app from Home. A white outline follows whatever is focused and takes its shape. Text fields only raise the on-screen keyboard when OK is pressed on them.
- **Voice search**: the microphone at the end of the search bar opens the TV's voice prompt and searches for what you say.
- **Playback**: streams play through Media3 (ExoPlayer) on a surface beneath the transparent page, while the page draws the controls. MKV and MP4 play directly with hardware decoding, including HEVC and HDR where the device supports them, and Dolby audio passes through to the TV or receiver over HDMI. Audio the TV can't play itself, such as DTS and Dolby TrueHD, is decoded in software, so every track in a release can be picked. Raffi starts with the track in the TV's language, falling back to English. Embedded subtitles show up alongside addon subtitles, which are fetched only when picked.
- **Bridge**: the page and the host talk over `window.raffiTv`, a JSON message channel. The host also makes requests on the page's behalf, for the few services that don't allow browser origins and for Limbo on your network.

Debrid, direct HTTP, and torrent streams play. Provider web players aren't supported on TV yet.

## Torrents

The TV doesn't run a torrent client itself. Torrent streams come from [Limbo](https://limbo.kaleid.al) running on a computer on the same network, which downloads the torrent and serves the video to the TV as it arrives.

To set it up once:

1. In Limbo on the computer, open Settings → Torrents and turn on **Devices on your network**.
2. On the TV, open Settings and turn on **Allow Torrenting**. Raffi looks for Limbo on the network and lists the computers it finds.
3. In Limbo, choose **Pair**, then type the six-digit code Limbo shows into the TV.

After that, picking a torrent stream on the TV starts it in Limbo and plays it as soon as enough is buffered. If the computer's address changes, Raffi finds it again on its own. Unpair from either side: **Unpair** on the TV, or the remove button next to the TV in Limbo's device list.

Limbo is found over mDNS (`_limbo._tcp`). If your network or the computer's firewall blocks that, choose **Enter an address** and type the computer's IP address. The computer has to accept incoming connections on TCP port 17890, Limbo's API port, and UDP port 5353 for discovery. On Android 17 and later, Raffi asks for permission to reach devices on your local network the first time.

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

The emulator sits behind its own network, so it can't see Limbo announcing itself. Pair it with **Enter an address** and `10.0.2.2`, the emulator's address for the computer it runs on.

Debug builds allow Chrome DevTools to attach to the WebView. With the TV or an emulator connected over adb, open `chrome://inspect` in Chrome and pick the Raffi page.
