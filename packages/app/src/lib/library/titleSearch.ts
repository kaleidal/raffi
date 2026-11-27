import { isBrokenTitleId } from "./catalogQuality";
import { addonHasCatalogResource, normalizeAddonBaseUrl, normalizeCatalogType, type CatalogType } from "./addonManifest";
import { CINEMETA_BASE_URL, fetchJson } from "./library";
import { getAddons, type Addon } from "../db/db";

export type SearchTitleResult = {
    id: string;
    imdbId: string;
    name: string;
    type: CatalogType;
    poster: string | null;
    year: string | null;
    releaseInfo: string | null;
};

export type SplitSearchResults = {
    movies: SearchTitleResult[];
    series: SearchTitleResult[];
};

const SEARCH_LIMIT = 20;
const ADDON_SEARCH_TIMEOUT_MS = 1800;
const ADDON_SEARCH_MAX_CATALOGS_PER_TYPE = 8;
const ADDON_SEARCH_CACHE_TTL_MS = 60 * 1000;
const ADDON_SEARCH_CACHE_MAX_ENTRIES = 50;

function mapSearchMeta(meta: any, fallbackType: CatalogType): SearchTitleResult | null {
    const id = String(meta?.imdb_id ?? meta?.id ?? "").trim();
    if (!id || isBrokenTitleId(id)) return null;

    const rawYear = meta?.year ?? null;
    let year: string | null = null;
    if (rawYear != null) {
        const numericYear = Number(rawYear);
        if (!Number.isNaN(numericYear) && Number.isFinite(numericYear)) {
            year = String(Math.trunc(numericYear));
        } else {
            const parsedYear = String(rawYear).match(/\d{4}/)?.[0];
            year = parsedYear ?? null;
        }
    } else {
        year = String(meta?.releaseInfo ?? "").match(/\d{4}/)?.[0] ?? null;
    }

    return {
        id,
        imdbId: id,
        name: String(meta?.name ?? "Unknown"),
        type: meta?.type === "series" ? "series" : fallbackType,
        poster: typeof meta?.poster === "string" ? meta.poster : null,
        year,
        releaseInfo:
            typeof meta?.releaseInfo === "string" ? meta.releaseInfo : null,
    };
}

async function searchCinemetaByType(type: CatalogType, query: string): Promise<SearchTitleResult[]> {
    try {
        const url = `${CINEMETA_BASE_URL}/catalog/${type}/top/search=${encodeURIComponent(query)}.json`;
        const payload = await fetchJson(url);
        const metas = Array.isArray(payload?.metas) ? payload.metas : [];
        const deduped = new Map<string, SearchTitleResult>();

        for (const meta of metas) {
            const mapped = mapSearchMeta(meta, type);
            if (!mapped) continue;
            if (!deduped.has(mapped.id)) {
                deduped.set(mapped.id, mapped);
            }
        }

        return Array.from(deduped.values()).slice(0, SEARCH_LIMIT);
    } catch (e) {
        console.error(`Cinemeta search failed for ${type}`, e);
        return [];
    }
}

type ManifestExtraProp = {
    name?: string;
    isRequired?: boolean;
    options?: string[];
};

type ManifestCatalog = {
    id?: string;
    type?: string;
    extra?: ManifestExtraProp[];
    extraRequired?: string[];
    extraSupported?: string[];
};

type AddonSearchCatalog = {
    baseUrl: string;
    catalogId: string;
    catalogType: CatalogType;
    extra: Record<string, string>;
};

type CachedAddonSearch = {
    timestamp: number;
    data: SplitSearchResults;
    promise?: Promise<SplitSearchResults>;
};

const addonSearchCache = new Map<string, CachedAddonSearch>();

function setAddonSearchCache(key: string, value: CachedAddonSearch) {
    addonSearchCache.delete(key);
    addonSearchCache.set(key, value);
    while (addonSearchCache.size > ADDON_SEARCH_CACHE_MAX_ENTRIES) {
        const oldestKey = addonSearchCache.keys().next().value;
        if (oldestKey === undefined) break;
        addonSearchCache.delete(oldestKey);
    }
}

function getCatalogExtraProps(catalog: ManifestCatalog): ManifestExtraProp[] {
    if (Array.isArray(catalog.extra)) {
        return catalog.extra.filter((item) => Boolean(item?.name));
    }

    const supported = Array.isArray(catalog.extraSupported)
        ? catalog.extraSupported.filter(Boolean)
        : [];
    const required = new Set(
        Array.isArray(catalog.extraRequired)
            ? catalog.extraRequired.filter(Boolean)
            : [],
    );

    return supported.map((name) => ({
        name: String(name),
        isRequired: required.has(name),
        options: [],
    }));
}

function resolveSearchExtra(catalog: ManifestCatalog) {
    const extras = getCatalogExtraProps(catalog);
    if (extras.length === 0) return null;

    const supportsSearch = extras.some(
        (extra) => String(extra.name ?? "").trim().toLowerCase() === "search",
    );
    if (!supportsSearch) return null;

    const resolved: Record<string, string> = {};
    for (const extra of extras) {
        const name = String(extra.name ?? "").trim();
        if (!name || !extra.isRequired) continue;
        if (name === "search") continue;

        const firstOption =
            Array.isArray(extra.options) && extra.options.length > 0
                ? String(extra.options[0] ?? "").trim()
                : "";
        if (firstOption) {
            resolved[name] = firstOption;
            continue;
        }
        if (name === "skip") {
            resolved[name] = "0";
            continue;
        }
        return null;
    }

    return resolved;
}

function buildCatalogExtraPath(extra: Record<string, string>) {
    const entries = Object.entries(extra)
        .filter(
            ([key, value]) =>
                String(key).trim().length > 0 &&
                String(value).trim().length > 0,
        )
        .sort((a, b) => a[0].localeCompare(b[0]));
    if (entries.length === 0) return "";
    return entries
        .map(
            ([key, value]) =>
                `/${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
        )
        .join("");
}

function discoverAddonSearchCatalogs(
    addons: Addon[],
    type: CatalogType,
): AddonSearchCatalog[] {
    const catalogs: AddonSearchCatalog[] = [];
    const seen = new Set<string>();

    for (const addon of addons) {
        if (!addonHasCatalogResource(addon)) continue;

        const baseUrl = normalizeAddonBaseUrl(addon.transport_url);
        if (!baseUrl) continue;

        const manifestCatalogs: ManifestCatalog[] = Array.isArray(addon?.manifest?.catalogs)
            ? addon.manifest.catalogs
            : [];

        for (const catalog of manifestCatalogs) {
            const catalogType = normalizeCatalogType(catalog?.type);
            if (!catalogType || catalogType !== type) continue;
            const catalogId = String(catalog?.id ?? "").trim();
            if (!catalogId) continue;

            const extra = resolveSearchExtra(catalog);
            if (extra == null) continue;

            const key = `${baseUrl}::${catalogType}::${catalogId}::${JSON.stringify(extra)}`;
            if (seen.has(key)) continue;
            seen.add(key);

            catalogs.push({
                baseUrl,
                catalogId,
                catalogType,
                extra,
            });
        }
    }

    return catalogs.slice(0, ADDON_SEARCH_MAX_CATALOGS_PER_TYPE);
}

async function fetchAddonCatalogSearch(
    catalog: AddonSearchCatalog,
    query: string,
): Promise<SearchTitleResult[]> {
    const extraPath = buildCatalogExtraPath({
        search: query,
        ...catalog.extra,
    });
    const url = `${catalog.baseUrl}/catalog/${encodeURIComponent(catalog.catalogType)}/${encodeURIComponent(catalog.catalogId)}${extraPath}.json`;

    try {
        const payload = await fetchJson(url);
        const metas = Array.isArray(payload?.metas) ? payload.metas : [];
        const mapped = metas
            .map((meta: any) => mapSearchMeta(meta, catalog.catalogType))
            .filter((item: SearchTitleResult | null): item is SearchTitleResult => item !== null);

        const deduped = new Map<string, SearchTitleResult>();
        for (const item of mapped) {
            if (!deduped.has(item.id)) deduped.set(item.id, item);
        }
        return Array.from(deduped.values());
    } catch {
        return [];
    }
}

async function searchAddonCatalogsByType(
    type: CatalogType,
    query: string,
    addons: Addon[],
): Promise<SearchTitleResult[]> {
    const catalogs = discoverAddonSearchCatalogs(addons, type);
    if (catalogs.length === 0) return [];

    const timeout = new Promise<SearchTitleResult[]>((resolve) =>
        setTimeout(() => resolve([]), ADDON_SEARCH_TIMEOUT_MS),
    );
    const searchPromise = Promise.all(
        catalogs.map((catalog) => fetchAddonCatalogSearch(catalog, query)),
    ).then((batches) => {
        const deduped = new Map<string, SearchTitleResult>();
        for (const batch of batches) {
            for (const item of batch) {
                if (!deduped.has(item.id)) deduped.set(item.id, item);
            }
        }
        return Array.from(deduped.values());
    });

    return Promise.race([searchPromise, timeout]);
}

export const searchTitlesSplit = async (query: string): Promise<SplitSearchResults> => {
    const trimmed = (query || "").trim();
    if (!trimmed) return { movies: [], series: [] };

    const [movies, series] = await Promise.all([
        searchCinemetaByType("movie", trimmed),
        searchCinemetaByType("series", trimmed),
    ]);

    return { movies, series };
}

export const searchAddonTitlesSplit = async (
    query: string,
): Promise<SplitSearchResults> => {
    const trimmed = (query || "").trim();
    if (!trimmed) return { movies: [], series: [] };
    if (trimmed.length < 2) return { movies: [], series: [] };

    const cacheKey = trimmed.toLowerCase();
    const cached = addonSearchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < ADDON_SEARCH_CACHE_TTL_MS) {
        addonSearchCache.delete(cacheKey);
        addonSearchCache.set(cacheKey, cached);
        if (cached.data.movies.length > 0 || cached.data.series.length > 0) {
            return cached.data;
        }
        if (cached.promise) return cached.promise;
    }

    const promise = (async () => {
        const addons = await getAddons();
        const [movies, series] = await Promise.all([
            searchAddonCatalogsByType("movie", trimmed, addons),
            searchAddonCatalogsByType("series", trimmed, addons),
        ]);
        const result = { movies, series };
        setAddonSearchCache(cacheKey, {
            timestamp: Date.now(),
            data: result,
        });
        return result;
    })();

    setAddonSearchCache(cacheKey, {
        timestamp: Date.now(),
        data: { movies: [], series: [] },
        promise,
    });

    return promise;
}

export function mergeSearchRows(
    primary: SearchTitleResult[],
    secondary: SearchTitleResult[],
) {
    const merged = new Map<string, SearchTitleResult>();
    for (const item of primary) {
        if (!merged.has(item.id)) merged.set(item.id, item);
    }
    for (const item of secondary) {
        if (!merged.has(item.id)) merged.set(item.id, item);
    }
    return Array.from(merged.values());
}

export const searchTitles = async (query: string): Promise<any[]> => {
    const { movies, series } = await searchTitlesSplit(query);
    const combined = [...movies, ...series];

    // Backward-compatible shape for existing callers (local library matcher).
    return combined.map((result) => ({
        "#IMDB_ID": result.imdbId,
        "#TITLE": result.name,
        "#YEAR": result.year ?? "",
        "#IMG_POSTER": result.poster ?? "",
        "#TYPE": result.type,
    }));
}
