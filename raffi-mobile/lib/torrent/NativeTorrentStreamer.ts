/**
 * Native Module Specification for TorrentStreamer
 * 
 * This file defines the interface for the native torrent streaming module.
 * The native implementation handles:
 * - Torrent downloading and piece prioritization
 * - Local HTTP server for streaming
 * - Automatic video file selection
 */

import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface TorrentStreamerConfig {
  downloadPath: string;
  maxConnections: number;
  maxDownloadSpeed: number; // 0 = unlimited
  maxUploadSpeed: number;
}

export interface StartStreamParams {
  sessionId: string;
  magnetUri: string;
  fileIndex: number; // -1 for auto-select
  port: number;
}

export interface StartStreamResult {
  streamUrl: string;
  infoHash: string;
}

export interface Spec extends TurboModule {
  initialize(config: TorrentStreamerConfig): Promise<void>;
  startStream(params: StartStreamParams): Promise<StartStreamResult>;
  stopStream(sessionId: string): Promise<void>;
  stopAll(): Promise<void>;
  getSessionInfo(sessionId: string): Promise<object | null>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('TorrentStreamer');
