# Torrent Streaming for Raffi Mobile

This module provides standalone on-device torrent streaming, similar to how Stremio handles torrent playback.

## How it Works

1. **Android**: Uses `TorrentStream-Android` (based on libtorrent) to download torrents with piece prioritization optimized for streaming. A local HTTP server serves the video to the player.

2. **iOS**: Currently shows a message to use debrid services. Full implementation requires compiling libtorrent for iOS.

## Architecture

```
┌──────────────────┐     ┌─────────────────────┐     ┌──────────────┐
│  React Native    │────▶│  TorrentStreamer.ts │────▶│ Native Module│
│  (player.tsx)    │     │  (JS interface)     │     │ (Java/ObjC)  │
└──────────────────┘     └─────────────────────┘     └──────┬───────┘
                                                            │
                              ┌─────────────────────────────┘
                              ▼
                    ┌─────────────────────┐
                    │  TorrentStream lib  │  (Android: libtorrent4j)
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  Local HTTP Server  │  (NanoHTTPD)
                    │  http://127.0.0.1:  │
                    │  8765/stream/{id}   │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    expo-video       │  (Plays the stream)
                    └─────────────────────┘
```

## Building

Since this uses native code, you need a development build (not Expo Go):

```bash
# Generate native projects
npx expo prebuild

# Build for Android
npx expo run:android

# Build for iOS (torrent streaming not yet available)
npx expo run:ios
```

## Stream Flow

1. User selects a torrent stream on meta page
2. `player.tsx` receives magnet URI
3. `TorrentStreamer.startStream(magnetUri)` called
4. Native module:
   - Parses magnet URI
   - Connects to DHT/trackers
   - Downloads torrent metadata
   - Identifies video file
   - Starts downloading with streaming priority
   - Spins up local HTTP server
   - Returns stream URL
5. Player uses `http://127.0.0.1:8765/stream/{sessionId}` for playback
6. HTTP server supports range requests for seeking

## Fallback for iOS

Until native torrent streaming is implemented for iOS, users should:

1. **Use Debrid Services** (recommended):
   - Real-Debrid
   - AllDebrid  
   - Premiumize
   
   These convert torrent links to direct HTTP links that work instantly.

2. **Configure a debrid service in Settings** to enable torrent addon streams.

## Technical Notes

### Piece Prioritization
TorrentStream-Android automatically prioritizes pieces needed for streaming:
- First pieces for metadata and headers
- Pieces from current playback position
- Lookahead buffer

### Memory Management
- Torrents use cache directory (auto-cleaned)
- `removeFilesAfterStop: true` ensures cleanup
- Maximum connections limited to preserve battery

### Limitations
- Single active torrent at a time (for now)
- DHT-only torrents may take longer to find peers
- Some private trackers may not work
