/**
 * TorrentStreamer - On-device torrent streaming for React Native
 * 
 * This module provides torrent streaming functionality using native code.
 * It requires a development build (not Expo Go) with the native module installed.
 * 
 * For Android: Uses libtorrent4j via a native module
 * For iOS: Uses libtorrent via a native module
 */

import { NativeEventEmitter, NativeModules } from 'react-native';

// Types
export interface TorrentFile {
  index: number;
  name: string;
  path: string;
  size: number;
  isVideo: boolean;
}

export interface TorrentInfo {
  infoHash: string;
  name: string;
  totalSize: number;
  files: TorrentFile[];
  downloadSpeed: number;
  uploadSpeed: number;
  progress: number;
  seeds: number;
  peers: number;
}

export interface StreamSession {
  id: string;
  magnetUri: string;
  fileIndex: number;
  streamUrl: string;
  info: TorrentInfo | null;
  status: 'initializing' | 'downloading_metadata' | 'buffering' | 'ready' | 'error';
  error?: string;
  bufferProgress: number;
}

type StreamListener = (session: StreamSession) => void;

// Check if native module is available
const NativeTorrentStreamer = NativeModules.TorrentStreamer;
const isNativeAvailable = !!NativeTorrentStreamer;

// Fallback WebTorrent implementation for development/testing
// Note: WebTorrent only works with WebRTC-enabled torrents
let webtorrentClient: any = null;

class TorrentStreamerClass {
  private sessions: Map<string, StreamSession> = new Map();
  private listeners: Map<string, Set<StreamListener>> = new Map();
  private eventEmitter: NativeEventEmitter | null = null;
  private localServerPort: number = 8765;
  private isInitialized: boolean = false;

  constructor() {
    if (isNativeAvailable) {
      this.eventEmitter = new NativeEventEmitter(NativeTorrentStreamer);
      this.setupNativeListeners();
    }
  }

  private setupNativeListeners() {
    if (!this.eventEmitter) return;

    this.eventEmitter.addListener('onTorrentProgress', (data) => {
      const session = this.sessions.get(data.sessionId);
      if (session) {
        session.info = {
          ...session.info!,
          downloadSpeed: data.downloadSpeed,
          uploadSpeed: data.uploadSpeed,
          progress: data.progress,
          seeds: data.seeds,
          peers: data.peers,
        };
        // Use progress as buffer progress (0-100)
        session.bufferProgress = data.progress;
        this.notifyListeners(data.sessionId, session);
      }
    });

    // onTorrentReady = metadata received, but not yet ready for playback
    this.eventEmitter.addListener('onTorrentReady', (data) => {
      const session = this.sessions.get(data.sessionId);
      if (session) {
        session.status = 'buffering'; // Still buffering, not ready yet
        session.streamUrl = data.streamUrl;
        session.info = {
          infoHash: '',
          name: data.info?.name || 'Unknown',
          totalSize: data.info?.fileSize || 0,
          files: [],
          downloadSpeed: 0,
          uploadSpeed: 0,
          progress: 0,
          seeds: 0,
          peers: 0,
        };
        this.notifyListeners(data.sessionId, session);
      }
    });

    // onStreamReady = enough pieces downloaded, ready for playback
    this.eventEmitter.addListener('onStreamReady', (data) => {
      const session = this.sessions.get(data.sessionId);
      if (session) {
        session.status = 'ready';
        session.streamUrl = data.streamUrl;
        this.notifyListeners(data.sessionId, session);
      }
    });

    this.eventEmitter.addListener('onTorrentError', (data) => {
      const session = this.sessions.get(data.sessionId);
      if (session) {
        session.status = 'error';
        session.error = data.error;
        this.notifyListeners(data.sessionId, session);
      }
    });

    this.eventEmitter.addListener('onTorrentFinished', (data) => {
      const session = this.sessions.get(data.sessionId);
      if (session) {
        session.bufferProgress = 100;
        session.status = 'ready';
        this.notifyListeners(data.sessionId, session);
      }
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    if (isNativeAvailable) {
      try {
        await NativeTorrentStreamer.initialize({
          // Don't pass downloadPath - let native code use getCacheDir() for correct app package
          maxConnections: 100,
          maxDownloadSpeed: 0, // unlimited
          maxUploadSpeed: 50 * 1024, // 50 KB/s upload limit to save bandwidth
        });
        this.isInitialized = true;
      } catch (e) {
        console.error('Failed to initialize native torrent streamer:', e);
        throw e;
      }
    } else {
      // Native module not available - will show error when trying to stream
      console.warn('Native TorrentStreamer not available. Magnet links will not work in Expo Go.');
      this.isInitialized = true;
    }
  }

  /**
   * Start streaming a torrent
   */
  async startStream(magnetUri: string, fileIndex?: number): Promise<StreamSession> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const sessionId = this.generateSessionId();
    
    const session: StreamSession = {
      id: sessionId,
      magnetUri,
      fileIndex: fileIndex ?? -1, // -1 means auto-select largest video file
      streamUrl: '',
      info: null,
      status: 'initializing',
      bufferProgress: 0,
    };

    this.sessions.set(sessionId, session);

    if (!isNativeAvailable) {
      // No native module - return error
      session.status = 'error';
      session.error = 'Torrent streaming requires a development build. Please build the app with native modules to enable torrent playback.';
      return session;
    }

    try {
      // Start the torrent via native module
      const result = await NativeTorrentStreamer.startStream({
        sessionId,
        magnetUri,
        fileIndex: fileIndex ?? -1,
        port: this.localServerPort,
      });

      session.status = 'downloading_metadata';
      session.streamUrl = result.streamUrl;
      
      this.notifyListeners(sessionId, session);
      return session;
    } catch (e: any) {
      session.status = 'error';
      session.error = e.message || 'Failed to start torrent stream';
      return session;
    }
  }

  /**
   * Stop a streaming session
   */
  async stopStream(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (isNativeAvailable) {
      try {
        await NativeTorrentStreamer.stopStream(sessionId);
      } catch (e) {
        console.error('Failed to stop stream:', e);
      }
    }

    this.sessions.delete(sessionId);
    this.listeners.delete(sessionId);
  }

  /**
   * Stop all streaming sessions
   */
  async stopAll(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    await Promise.all(sessionIds.map(id => this.stopStream(id)));
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): StreamSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Subscribe to session updates
   */
  subscribe(sessionId: string, listener: StreamListener): () => void {
    if (!this.listeners.has(sessionId)) {
      this.listeners.set(sessionId, new Set());
    }
    this.listeners.get(sessionId)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.get(sessionId)?.delete(listener);
    };
  }

  private notifyListeners(sessionId: string, session: StreamSession) {
    const sessionListeners = this.listeners.get(sessionId);
    if (sessionListeners) {
      sessionListeners.forEach(listener => listener(session));
    }
  }

  private generateSessionId(): string {
    return `ts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if native streaming is available
   */
  isAvailable(): boolean {
    return isNativeAvailable;
  }

  /**
   * Parse magnet URI to extract info hash
   */
  parseInfoHash(magnetUri: string): string | null {
    const match = magnetUri.match(/urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
    return match ? match[1].toLowerCase() : null;
  }

  /**
   * Get video files from torrent info
   */
  getVideoFiles(info: TorrentInfo): TorrentFile[] {
    const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.m4v'];
    return info.files.filter(f => 
      videoExtensions.some(ext => f.name.toLowerCase().endsWith(ext))
    ).sort((a, b) => b.size - a.size);
  }
}

// Singleton instance
export const TorrentStreamer = new TorrentStreamerClass();
export default TorrentStreamer;
