import { normalizeAddonUrl, toMediaMeta } from './domain';
import type { AddonConfig, AddonManifest, CatalogSection, MediaMeta, MediaType, Stream } from './types';

const CINEMETA = 'https://v3-cinemeta.strem.io';

async function fetchJson<T>(url: string, timeoutMs = 10_000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchManifest(url: string): Promise<AddonConfig> {
  const transportUrl = normalizeAddonUrl(url);
  const manifest = await fetchJson<AddonManifest>(`${transportUrl}/manifest.json`);
  if (!manifest.id || !manifest.name) throw new Error('Invalid addon manifest');
  return { transportUrl, manifest };
}

export async function fetchMeta(type: MediaType, id: string): Promise<MediaMeta> {
  const payload = await fetchJson<{ meta: Record<string, unknown> }>(`${CINEMETA}/meta/${type}/${encodeURIComponent(id)}.json`);
  const normalized = toMediaMeta(payload.meta, type);
  if (!normalized) throw new Error('Metadata was empty');
  return normalized;
}

export async function fetchCatalog(type: MediaType, id = 'top'): Promise<MediaMeta[]> {
  const payload = await fetchJson<{ metas: Record<string, unknown>[] }>(`${CINEMETA}/catalog/${type}/${id}.json`);
  return (payload.metas ?? []).map((item) => toMediaMeta(item, type)).filter((item): item is MediaMeta => Boolean(item));
}

export async function fetchHomeSections(addons: AddonConfig[]): Promise<CatalogSection[]> {
  const basePlans = [
    { id: 'movies', title: 'Popular movies', type: 'movie' as const, url: `${CINEMETA}/catalog/movie/top.json` },
    { id: 'series', title: 'Popular series', type: 'series' as const, url: `${CINEMETA}/catalog/series/top.json` },
    { id: 'scifi', title: 'Mind-bending sci-fi', type: 'movie' as const, url: `${CINEMETA}/catalog/movie/top/genre=Sci-Fi.json` },
    { id: 'romance', title: 'Romance', type: 'movie' as const, url: `${CINEMETA}/catalog/movie/top/genre=Romance.json` },
  ];
  const addonPlans = addons.flatMap((addon) => (addon.manifest.catalogs ?? []).slice(0, 4).map((catalog) => ({
    id: `${addon.manifest.id}:${catalog.type}:${catalog.id}`,
    title: catalog.name || `${addon.manifest.name} · ${catalog.id}`,
    type: catalog.type,
    url: `${addon.transportUrl}/catalog/${catalog.type}/${encodeURIComponent(catalog.id)}.json`,
  })));
  const sections = await Promise.all([...basePlans, ...addonPlans].map(async (plan) => {
    try {
      const payload = await fetchJson<{ metas?: Record<string, unknown>[] }>(plan.url);
      return { id: plan.id, title: plan.title, items: (payload.metas ?? []).map((item) => toMediaMeta(item, plan.type)).filter((item): item is MediaMeta => Boolean(item)).slice(0, 24) };
    } catch {
      return { id: plan.id, title: plan.title, items: [] };
    }
  }));
  return sections.filter((section) => section.items.length > 0);
}

export async function searchMedia(query: string): Promise<MediaMeta[]> {
  const normalized = query.trim();
  if (!normalized) return [];
  const payload = await fetchJson<{ description?: Array<Record<string, unknown>> }>(`https://imdb.iamidiotareyoutoo.com/search?q=${encodeURIComponent(normalized)}&lsn=1&v=1`);
  return (payload.description ?? []).map((item) => toMediaMeta({ ...item, id: item['#IMDB_ID'], name: item['#TITLE'], poster: item['#IMG_POSTER'], year: item['#YEAR'] }, 'movie')).filter((item): item is MediaMeta => Boolean(item));
}

export async function fetchStreams(addons: AddonConfig[], type: MediaType, id: string): Promise<Stream[]> {
  const responses = await Promise.all(addons.map(async (addon) => {
    try {
      const payload = await fetchJson<{ streams?: Stream[] }>(`${addon.transportUrl}/stream/${type}/${encodeURIComponent(id)}.json`, 15_000);
      return payload.streams ?? [];
    } catch {
      return [];
    }
  }));
  return responses.flat();
}
