import type { AddonConfig, MediaMeta, RaffiList, RankedStream, Stream, WatchProgress } from './types';

const RESOLUTION_RANK: Record<string, number> = {
  '2160p': 5,
  '1440p': 4,
  '1080p': 3,
  '720p': 2,
  '480p': 1,
};

export function normalizeAddonUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error('Addon URL is required');
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  return url.toString().replace(/\/?manifest\.json\/?$/i, '').replace(/\/$/, '');
}

export function hasStreamResource(addon: AddonConfig): boolean {
  return Boolean(addon.manifest.resources?.some((resource) =>
    resource === 'stream' || (typeof resource === 'object' && resource.name === 'stream')));
}

export function toMediaMeta(input: Record<string, unknown>, fallbackType: 'movie' | 'series'): MediaMeta | null {
  const imdbId = String(input.imdb_id ?? input.id ?? '').trim();
  if (!imdbId) return null;
  const type = input.type === 'series' || input.type === 'movie' ? input.type : fallbackType;
  return {
    id: String(input.id ?? imdbId),
    imdbId,
    type,
    name: String(input.name ?? 'Unknown'),
    description: input.description ? String(input.description) : undefined,
    poster: input.poster ? String(input.poster) : undefined,
    background: input.background ? String(input.background) : undefined,
    logo: input.logo ? String(input.logo) : undefined,
    year: input.year ? String(input.year) : undefined,
    runtime: input.runtime ? String(input.runtime) : undefined,
    rating: input.imdbRating ? String(input.imdbRating) : undefined,
    genres: Array.isArray(input.genres) ? input.genres.map(String) : Array.isArray(input.genre) ? input.genre.map(String) : undefined,
    videos: Array.isArray(input.videos) ? input.videos.map((video: any) => ({
      id: String(video.id ?? ''),
      title: String(video.title ?? `Episode ${video.episode ?? ''}`),
      season: Number(video.season ?? 1),
      episode: Number(video.episode ?? 1),
      released: video.released ? String(video.released) : undefined,
      overview: video.overview ? String(video.overview) : undefined,
      thumbnail: video.thumbnail ? String(video.thumbnail) : undefined,
    })) : undefined,
  };
}

function textFor(stream: Stream) {
  return [stream.name, stream.title, stream.description, stream.behaviorHints?.filename]
    .filter(Boolean).join(' ');
}

export function rankStream(stream: Stream, index = 0): RankedStream {
  const text = textFor(stream);
  const resolutionMatch = text.match(/(2160|1440|1080|720|480)p/i);
  const resolution = resolutionMatch ? `${resolutionMatch[1]}p` : /\b4k\b/i.test(text) ? '2160p' : undefined;
  const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
  const sizeValue = sizeMatch?.[1];
  const sizeUnit = sizeMatch?.[2];
  const sizeMb = sizeValue && sizeUnit ? Number(sizeValue) * (sizeUnit.toUpperCase() === 'GB' ? 1024 : 1) : undefined;
  const peerMatch = text.match(/(?:👤|👥|seeders?|peers?)\s*[: ]?\s*(\d+)/i) ?? text.match(/(\d+)\s*(?:seeders?|peers?)/i);
  const peers = peerMatch ? Number(peerMatch[1]) : undefined;
  const sourceType = stream.infoHash || stream.url?.startsWith('magnet:') ? 'torrent' : /^https?:\/\//i.test(stream.url ?? '') ? 'direct' : 'unknown';
  const provider = stream.name?.trim() || text.split(/[|•]/).at(-1)?.trim() || 'Source';
  const badges = [resolution?.toUpperCase(), /HDR|Dolby Vision|\bDV\b/i.test(text) ? 'HDR' : undefined,
    /Atmos/i.test(text) ? 'Atmos' : /E-?AC-?3|DDP/i.test(text) ? 'E-AC-3' : undefined,
    sizeValue && sizeUnit ? `${sizeValue} ${sizeUnit.toUpperCase()}` : undefined]
    .filter((badge): badge is string => Boolean(badge));
  return {
    id: stream.url ?? stream.infoHash ?? `${provider}-${index}`,
    stream,
    sourceType,
    provider,
    resolution,
    qualityRank: RESOLUTION_RANK[resolution ?? ''] ?? 0,
    sizeMb,
    peers,
    badges,
    requiresDesktop: sourceType !== 'direct' || Boolean(stream.behaviorHints?.notWebReady),
  };
}

export function rankStreams(streams: Stream[]): RankedStream[] {
  return streams.map(rankStream).sort((a, b) => {
    if (a.requiresDesktop !== b.requiresDesktop) return a.requiresDesktop ? 1 : -1;
    return (b.qualityRank - a.qualityRank) || ((b.peers ?? -1) - (a.peers ?? -1));
  });
}

export function progressPercent(progress: Pick<WatchProgress, 'positionSeconds' | 'durationSeconds'>): number {
  if (!Number.isFinite(progress.durationSeconds) || progress.durationSeconds <= 0) return 0;
  return Math.max(0, Math.min(100, (progress.positionSeconds / progress.durationSeconds) * 100));
}

export function mergeProgress(local: WatchProgress[], remote: WatchProgress[]): WatchProgress[] {
  const merged = new Map<string, WatchProgress>();
  for (const item of [...remote, ...local]) {
    const key = `${item.imdbId}:${item.season ?? 0}:${item.episode ?? 0}`;
    const current = merged.get(key);
    if (!current || Date.parse(item.updatedAt) >= Date.parse(current.updatedAt)) merged.set(key, item);
  }
  return [...merged.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function mergeLists(local: RaffiList[], remote: RaffiList[]): RaffiList[] {
  const merged = new Map<string, RaffiList>();
  for (const list of [...remote, ...local]) {
    const current = merged.get(list.id);
    if (!current || Date.parse(list.updatedAt) >= Date.parse(current.updatedAt)) merged.set(list.id, list);
  }
  return [...merged.values()].sort((a, b) => a.position - b.position);
}

export function pickFeatured(items: MediaMeta[]): MediaMeta | undefined {
  return [...items].filter((item) => item.background || item.poster).sort((a, b) => {
    const aScore = Number(Boolean(a.background)) * 100 + Number(a.rating ?? 0);
    const bScore = Number(Boolean(b.background)) * 100 + Number(b.rating ?? 0);
    return bScore - aScore || a.id.localeCompare(b.id);
  })[0];
}
