import type { Addon, PopularTitleMeta, ShowResponse, Stream } from './types';

// Cinemeta API endpoints
const CINEMETA_BASE = 'https://v3-cinemeta.strem.io';
const ADDON_HOME_SECTION_LIMIT = 12;
const ADDON_HOME_ITEMS_LIMIT = 20;
const ADDON_REQUEST_TIMEOUT_MS = 9000;

type ManifestExtraProp = {
  name?: string;
  isRequired?: boolean;
  options?: string[];
};

type ManifestCatalog = {
  id?: string;
  type?: string;
  name?: string;
  extra?: ManifestExtraProp[];
  extraRequired?: string[];
  extraSupported?: string[];
};

export interface AddonHomeSection {
  id: string;
  title: string;
  data: PopularTitleMeta[];
}

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
  const popularUrl = `${CINEMETA_BASE}/catalog/${type}/top.json`;

  const response = await fetch(popularUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch popular titles for type: ${type}`);
  }

  return (await response.json()).metas;
};

/**
 * Get featured/top rated titles by type
 */
export const getFeaturedTitles = async (type: string): Promise<PopularTitleMeta[]> => {
  const url = `${CINEMETA_BASE}/catalog/${type}/imdbRating.json`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch featured titles for type: ${type}`);
  }

  return (await response.json()).metas;
};

/**
 * Get new releases by year
 */
export const getNewReleases = async (type: string, year: number = new Date().getFullYear()): Promise<PopularTitleMeta[]> => {
  const url = `${CINEMETA_BASE}/catalog/${type}/year/genre=${year}.json`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch new releases for ${year}`);
  }

  return (await response.json()).metas;
};

/**
 * Get titles by genre
 */
export const getTitlesByGenre = async (type: string, genre: string): Promise<PopularTitleMeta[]> => {
  const url = `${CINEMETA_BASE}/catalog/${type}/top/genre=${encodeURIComponent(genre)}.json`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${genre} titles`);
  }

  return (await response.json()).metas;
};

function normalizeAddonBaseUrl(transportUrl: string): string {
  return (transportUrl || '')
    .trim()
    .replace(/\/?manifest\.json$/i, '')
    .replace(/\/+$/, '');
}

function isSupportedCatalogType(type: string): type is 'movie' | 'series' {
  return type === 'movie' || type === 'series';
}

function getCatalogExtraProps(catalog: ManifestCatalog): ManifestExtraProp[] {
  if (Array.isArray(catalog.extra)) {
    return catalog.extra.filter((item) => Boolean(item?.name));
  }

  const supported = Array.isArray(catalog.extraSupported)
    ? catalog.extraSupported.filter(Boolean)
    : [];
  const required = new Set(
    Array.isArray(catalog.extraRequired) ? catalog.extraRequired.filter(Boolean) : []
  );

  return supported.map((name) => ({
    name,
    isRequired: required.has(name),
    options: [],
  }));
}

function catalogRequiresExtra(catalog: ManifestCatalog) {
  return getCatalogExtraProps(catalog).some((extra) => Boolean(extra.isRequired));
}

function buildCatalogTitle(catalog: ManifestCatalog): string {
  const raw = typeof catalog.name === 'string' && catalog.name.trim().length > 0
    ? catalog.name.trim()
    : String(catalog.id || '').replace(/[-_]+/g, ' ').trim();

  if (!raw) return 'Catalog';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function formatCatalogType(type: 'movie' | 'series'): string {
  return type === 'series' ? 'Series' : 'Movies';
}

function toPopularMeta(item: any, fallbackType: 'movie' | 'series'): PopularTitleMeta | null {
  const id = String(item?.imdb_id ?? item?.id ?? '').trim();
  if (!id) return null;

  const normalizedType: 'movie' | 'series' =
    item?.type === 'movie' || item?.type === 'series'
      ? item.type
      : fallbackType;

  return {
    imdb_id: id,
    id,
    name: String(item?.name ?? 'Unknown'),
    type: normalizedType,
    popularities: item?.popularities ?? {},
    description: String(item?.description ?? ''),
    poster: item?.poster,
    genre: Array.isArray(item?.genre) ? item.genre : undefined,
    genres: Array.isArray(item?.genres) ? item.genres : undefined,
    imdbRating: item?.imdbRating,
    released: item?.released,
    slug: String(item?.slug ?? ''),
    year: item?.year,
    director: Array.isArray(item?.director) ? item.director : item?.director ?? null,
    writer: Array.isArray(item?.writer) ? item.writer : item?.writer ?? null,
    trailers: Array.isArray(item?.trailers) ? item.trailers : undefined,
    status: item?.status,
    background: item?.background,
    logo: item?.logo,
    popularity: item?.popularity,
    releaseInfo: item?.releaseInfo,
    trailerStreams: Array.isArray(item?.trailerStreams) ? item.trailerStreams : undefined,
    awards: item?.awards,
    runtime: item?.runtime,
  };
}

async function fetchAddonCatalog(
  baseUrl: string,
  type: 'movie' | 'series',
  catalogId: string
): Promise<PopularTitleMeta[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ADDON_REQUEST_TIMEOUT_MS);

  try {
    const url = `${baseUrl}/catalog/${encodeURIComponent(type)}/${encodeURIComponent(catalogId)}.json`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'RaffiMobile/1.0',
      },
    });

    if (!response.ok) return [];
    const payload = await response.json();
    const metas = Array.isArray(payload?.metas) ? payload.metas : [];

    const mapped = metas
      .map((meta: any) => toPopularMeta(meta, type))
      .filter((meta: PopularTitleMeta | null): meta is PopularTitleMeta => meta !== null);

    const deduped = new Map<string, PopularTitleMeta>();
    for (const meta of mapped) {
      if (!deduped.has(meta.imdb_id)) deduped.set(meta.imdb_id, meta);
    }

    return Array.from(deduped.values());
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getAddonHomeSections(
  addons: Addon[],
  options?: { maxSections?: number; maxItemsPerSection?: number }
): Promise<AddonHomeSection[]> {
  const maxSections = options?.maxSections ?? ADDON_HOME_SECTION_LIMIT;
  const maxItemsPerSection = options?.maxItemsPerSection ?? ADDON_HOME_ITEMS_LIMIT;

  const planned = addons
    .flatMap((addon) => {
      const baseUrl = normalizeAddonBaseUrl(addon.transport_url);
      const addonName = String(addon?.manifest?.name ?? 'Addon').trim() || 'Addon';
      const catalogs: ManifestCatalog[] = Array.isArray(addon?.manifest?.catalogs)
        ? addon.manifest.catalogs
        : [];

      if (!baseUrl || catalogs.length === 0) return [];

      return catalogs
        .map((catalog) => {
          const catalogId = String(catalog?.id ?? '').trim();
          const catalogType = String(catalog?.type ?? '').trim();

          if (!catalogId || !isSupportedCatalogType(catalogType)) return null;
          if (catalogRequiresExtra(catalog)) return null;

          return {
            key: `${baseUrl}::${catalogType}::${catalogId}`,
            baseUrl,
            title: buildCatalogTitle(catalog),
            addonName,
            catalogId,
            catalogType,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
    })
    .filter((item, index, list) => list.findIndex((other) => other.key === item.key) === index)
    .slice(0, maxSections);

  const loaded = await Promise.all(
    planned.map(async (item) => {
      const data = await fetchAddonCatalog(item.baseUrl, item.catalogType, item.catalogId);
      return {
        ...item,
        data: data.slice(0, maxItemsPerSection),
      };
    })
  );

  const nonEmpty = loaded.filter((section) => section.data.length > 0);
  const baseTitleCounts = new Map<string, number>();
  for (const section of nonEmpty) {
    baseTitleCounts.set(section.title, (baseTitleCounts.get(section.title) ?? 0) + 1);
  }

  const withTypeTitle = nonEmpty.map((section) => {
    if ((baseTitleCounts.get(section.title) ?? 0) <= 1) {
      return { ...section, resolvedTitle: section.title };
    }
    return {
      ...section,
      resolvedTitle: `${section.title} (${formatCatalogType(section.catalogType)})`,
    };
  });

  const resolvedTitleCounts = new Map<string, number>();
  for (const section of withTypeTitle) {
    resolvedTitleCounts.set(
      section.resolvedTitle,
      (resolvedTitleCounts.get(section.resolvedTitle) ?? 0) + 1
    );
  }

  const withAddonTitle = withTypeTitle.map((section) => ({
    ...section,
    finalTitle:
      (resolvedTitleCounts.get(section.resolvedTitle) ?? 0) > 1
        ? `${section.resolvedTitle} • ${section.addonName}`
        : section.resolvedTitle,
  }));

  const finalTitleCounts = new Map<string, number>();
  for (const section of withAddonTitle) {
    finalTitleCounts.set(section.finalTitle, (finalTitleCounts.get(section.finalTitle) ?? 0) + 1);
  }

  return withAddonTitle.map((section) => ({
    id: section.key,
    title:
      (finalTitleCounts.get(section.finalTitle) ?? 0) > 1
        ? `${section.finalTitle} • ${section.catalogId}`
        : section.finalTitle,
    data: section.data,
  }));
}

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
    } catch {
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
