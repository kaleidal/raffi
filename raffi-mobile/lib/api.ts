import type { PopularTitleMeta, ShowResponse, Stream } from './types';

// Cinemeta API endpoints
const CINEMETA_BASE = 'https://v3-cinemeta.strem.io';

/**
 * Get metadata for a title
 */
export const getMetaData = async (imdbId: string, type: string): Promise<ShowResponse> => {
  const metaUrl = `${CINEMETA_BASE}/meta/${type}/${imdbId}.json`;

  const response = await fetch(metaUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch metadata for IMDB ID: ${imdbId}`);
  }

  return await response.json();
};

/**
 * Get popular titles by type (movie or series)
 */
export const getPopularTitles = async (type: string): Promise<PopularTitleMeta[]> => {
  const popularUrl = `${CINEMETA_BASE}/catalog/${type}/popular.json`;

  const response = await fetch(popularUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch popular titles for type: ${type}`);
  }

  return (await response.json()).metas;
};

/**
 * Search for titles
 */
export const searchTitles = async (query: string): Promise<any[]> => {
  if (!query) return [];

  const url = `https://imdb.iamidiotareyoutoo.com/search?q=${encodeURIComponent(query)}&tt=&lsn=1&v=1`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    return data.description || [];
  } catch (e) {
    console.error('Search failed', e);
    return [];
  }
};

/**
 * Fetch streams from an addon
 */
export const fetchStreams = async (
  addonUrl: string,
  type: string,
  imdbId: string,
  season?: number,
  episode?: number
): Promise<Stream[]> => {
  try {
    const baseUrl = (addonUrl || '')
      .trim()
      .replace(/\/?manifest\.json$/i, '')
      .replace(/\/+$/, '');

    if (!baseUrl) return [];

    let streamId = imdbId;
    if (type === 'series' && season !== undefined && episode !== undefined) {
      streamId += `:${season}:${episode}`;
    }

    const url = `${baseUrl}/stream/${type}/${streamId}.json`;
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'RaffiMobile/1.0',
      },
    });

    const bodyText = await response.text();
    if (!response.ok) {
      console.error('Failed to fetch streams', {
        url,
        status: response.status,
        contentType: response.headers.get('content-type'),
        bodyPreview: bodyText.slice(0, 200),
      });
      return [];
    }

    let result: any;
    try {
      result = JSON.parse(bodyText);
    } catch (e) {
      console.error('Failed to parse streams JSON', {
        url,
        status: response.status,
        contentType: response.headers.get('content-type'),
        bodyPreview: bodyText.slice(0, 200),
      });
      return [];
    }

    return Array.isArray(result.streams) ? result.streams : [];
  } catch (e) {
    console.error('Failed to fetch streams', e);
    return [];
  }
};

// Meta cache for performance
interface CachedMeta {
  data: ShowResponse;
  timestamp: number;
}

const CACHE_TTL = 1000 * 60 * 60; // 1 hour
const metaCache = new Map<string, CachedMeta>();
const pendingRequests = new Map<string, Promise<ShowResponse>>();

/**
 * Get cached metadata
 */
export async function getCachedMetaData(imdbId: string, type: string): Promise<ShowResponse> {
  const cacheKey = `${type}:${imdbId}`;

  const cached = metaCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey)!;
  }

  const promise = getMetaData(imdbId, type);
  pendingRequests.set(cacheKey, promise);

  try {
    const data = await promise;
    metaCache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  } finally {
    pendingRequests.delete(cacheKey);
  }
}

/**
 * Clear meta cache
 */
export function clearMetaCache() {
  metaCache.clear();
}
