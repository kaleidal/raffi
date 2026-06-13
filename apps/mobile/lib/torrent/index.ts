/**
 * Torrent Streaming Module
 * 
 * Provides on-device torrent streaming for React Native.
 * 
 * Usage:
 * ```typescript
 * import TorrentStreamer from '@/lib/torrent';
 * 
 * // Start streaming a torrent
 * const session = await TorrentStreamer.startStream('magnet:?xt=urn:btih:...');
 * 
 * // Subscribe to updates
 * const unsubscribe = TorrentStreamer.subscribe(session.id, (updated) => {
 *   if (updated.status === 'ready') {
 *     // Use updated.streamUrl for playback
 *   }
 * });
 * 
 * // Stop streaming when done
 * await TorrentStreamer.stopStream(session.id);
 * ```
 * 
 * Requirements:
 * - Development build (not Expo Go) for Android
 * - iOS implementation is pending (use debrid services)
 */

export { TorrentStreamer, default } from './TorrentStreamer';
export type {
    StreamSession, TorrentFile,
    TorrentInfo
} from './TorrentStreamer';

