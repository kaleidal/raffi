import type { Stream } from '@/lib/types';
import {
  buildAudioLanguageBadge,
  detectProvider,
  formatAvailability,
  parsePeerCount,
} from './streamMetadata';

export interface StreamPresentation {
  providerLabel: string;
  hostLabel: string | null;
  resolution: string | null;
  resolutionLabel: string | null;
  featureLabels: string[];
  statusLabels: string[];
  peerCount: number | null;
  isP2P: boolean;
  isDebrid: boolean;
  detailLine: string | null;
}

const debridPattern = /\[rd\+?\]|\[ad\]|\[pm\]|real-?debrid|alldebrid|premiumize/i;

const addUnique = (labels: string[], value?: string | null) => {
  if (!value || labels.includes(value)) return;
  labels.push(value);
};

export const buildStreamPresentation = (stream: Stream): StreamPresentation => {
  const title = String(stream.title ?? '');
  const description = String(stream.description ?? '');
  const filename = String(stream.behaviorHints?.bingeGroup ?? '');
  const fullText = [title, description, stream.name, filename].filter(Boolean).join(' ');
  const detailLine = [title, description].filter(Boolean).join(' - ') || null;

  let resolution: string | null = fullText.match(/(2160|1440|1080|720|540|480|360|240)p/i)?.[0] ?? null;
  if (!resolution && /4k/i.test(fullText)) resolution = '2160p';

  const resolutionLabel = resolution
    ? resolution.toLowerCase() === '2160p' && /4k/i.test(fullText)
      ? '4K'
      : resolution.toUpperCase()
    : null;

  const isDolbyVision = /Dolby\s?Vision|\bDV\b/i.test(fullText);
  const isHDR = /HDR/i.test(fullText) || isDolbyVision;
  const codec = /AV1/i.test(fullText)
    ? 'AV1'
    : /(?:x265|H\.?(?:265)|HEVC)/i.test(fullText)
      ? 'HEVC'
      : /(?:x264|H\.?(?:264))/i.test(fullText)
        ? 'H.264'
        : null;
  const audio = /Atmos/i.test(fullText)
    ? 'Atmos'
    : /DDP(?:\s?5\.1)?|DD5\.1/i.test(fullText)
      ? 'DDP 5.1'
      : /DTS/i.test(fullText)
        ? 'DTS'
        : null;
  const size = fullText.match(/(\d+(?:\.\d+)?)\s?(GB|MB)/i);
  const sizeLabel = size ? `${size[1]} ${size[2].toUpperCase()}` : null;
  const languageLabel = buildAudioLanguageBadge(fullText);
  const providerLabel = detectProvider(description) || detectProvider(fullText) || stream.name || 'Source';
  const hostLabel = stream.name && stream.name !== providerLabel ? stream.name : null;
  const isP2P = Boolean(stream.infoHash) || Boolean(stream.url?.startsWith('magnet:'));
  const isDebrid = debridPattern.test(fullText);
  const peerCount = isP2P ? parsePeerCount(description || title) : null;

  const featureLabels: string[] = [];
  addUnique(featureLabels, resolutionLabel);
  addUnique(featureLabels, isDolbyVision ? 'Dolby Vision' : isHDR ? 'HDR' : null);
  addUnique(featureLabels, codec);
  addUnique(featureLabels, audio);
  addUnique(featureLabels, languageLabel);
  addUnique(featureLabels, sizeLabel);

  const statusLabels: string[] = [];
  addUnique(statusLabels, formatAvailability(fullText.match(/\[([A-Za-z0-9+ ]+)\]/)?.[1] ?? null));
  addUnique(statusLabels, isDebrid ? 'Debrid' : null);
  addUnique(statusLabels, isP2P ? 'Torrent' : null);

  return {
    providerLabel,
    hostLabel,
    resolution,
    resolutionLabel,
    featureLabels,
    statusLabels,
    peerCount,
    isP2P,
    isDebrid,
    detailLine,
  };
};

export const sortStreamsForPlayback = (streams: Stream[]) => {
  return [...streams].sort((a, b) => {
    const aMeta = buildStreamPresentation(a);
    const bMeta = buildStreamPresentation(b);
    if (aMeta.isDebrid !== bMeta.isDebrid) return aMeta.isDebrid ? -1 : 1;

    const score = (resolution: string | null) => {
      if (!resolution) return 0;
      const value = Number.parseInt(resolution, 10);
      return Number.isFinite(value) ? value : 0;
    };
    const resolutionDiff = score(bMeta.resolution) - score(aMeta.resolution);
    if (resolutionDiff !== 0) return resolutionDiff;
    return (bMeta.peerCount ?? -1) - (aMeta.peerCount ?? -1);
  });
};

export const getStreamPlaybackSource = (stream: Stream): string | null => {
  if (stream.infoHash) return `magnet:?xt=urn:btih:${stream.infoHash}`;
  const url = stream.url?.trim();
  if (!url) return null;
  if (url.includes('/null/') || url.includes('/null.') || url.endsWith('/null')) return null;
  return url;
};
