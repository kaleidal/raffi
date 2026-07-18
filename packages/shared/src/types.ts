export type MediaType = 'movie' | 'series';

export interface MediaMeta {
  id: string;
  imdbId: string;
  type: MediaType;
  name: string;
  description?: string;
  poster?: string;
  background?: string;
  logo?: string;
  year?: string;
  runtime?: string;
  rating?: string;
  genres?: string[];
  videos?: EpisodeMeta[];
}

export interface EpisodeMeta {
  id: string;
  title: string;
  season: number;
  episode: number;
  released?: string;
  overview?: string;
  thumbnail?: string;
}

export interface AddonManifest {
  id: string;
  name: string;
  version?: string;
  description?: string;
  resources?: Array<string | { name: string; types?: string[] }>;
  catalogs?: Array<{ id: string; type: MediaType; name?: string }>;
  types?: string[];
}

export interface AddonConfig {
  transportUrl: string;
  manifest: AddonManifest;
}

export interface Stream {
  url?: string;
  infoHash?: string;
  fileIdx?: number;
  name?: string;
  title?: string;
  description?: string;
  behaviorHints?: { filename?: string; bingeGroup?: string; notWebReady?: boolean };
}

export type SourceType = 'direct' | 'torrent' | 'unknown';

export interface RankedStream {
  id: string;
  stream: Stream;
  sourceType: SourceType;
  provider: string;
  resolution?: string;
  qualityRank: number;
  sizeMb?: number;
  peers?: number;
  badges: string[];
  requiresDesktop: boolean;
}

export interface WatchProgress {
  imdbId: string;
  type: MediaType;
  positionSeconds: number;
  durationSeconds: number;
  season?: number;
  episode?: number;
  poster?: string;
  updatedAt: string;
}

export interface RaffiList {
  id: string;
  name: string;
  position: number;
  items: RaffiListItem[];
  updatedAt: string;
}

export interface RaffiListItem {
  imdbId: string;
  type: MediaType;
  poster?: string;
  position: number;
}

export type DevicePlatform = 'ios' | 'android' | 'android-tv';

export interface BridgeInfo {
  protocolVersion: 1;
  id: string;
  name: string;
  pairingRequired: true;
  capabilities: Array<'http' | 'torrent' | 'hls' | 'subtitles'>;
}

export interface PairRequest {
  challenge: string;
  deviceName: string;
  platform: DevicePlatform;
}

export interface PairResponse {
  deviceId: string;
  token: string;
  desktop: BridgeInfo;
}

export interface BridgePlaybackRequest {
  source: string;
  fileIndex?: number;
  startSeconds?: number;
  audioIndex?: number;
}

export interface BridgePlaybackSession {
  id: string;
  status: 'preparing' | 'ready' | 'error';
  playbackUrl: string;
  expiresAt: string;
  error?: string;
}

export interface CatalogSection {
  id: string;
  title: string;
  items: MediaMeta[];
}
