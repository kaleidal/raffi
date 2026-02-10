import type { ShowResponse } from "./types/meta_types";
import type { PopularTitleMeta } from "./types/popular_types";
import { getAddons, type Addon } from "../db/db";

type CatalogType = "movie" | "series";

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

const CINEMETA_BASE_URL = "https://v3-cinemeta.strem.io";
const REQUEST_TIMEOUT_MS = 9000;
const SEARCH_LIMIT = 20;
const ADDON_SEARCH_TIMEOUT_MS = 1800;
const ADDON_SEARCH_MAX_CATALOGS_PER_TYPE = 8;
const ADDON_SEARCH_CACHE_TTL_MS = 60 * 1000;

function normalizeType(type: string): CatalogType {
    return type === "series" ? "series" : "movie";
}

function normalizeAddonBaseUrl(transportUrl: string) {
    return (transportUrl || "")
        .trim()
        .replace(/\/?manifest\.json$/i, "")
        .replace(/\/+$/, "");
}

function isLikelyImdbId(id: string) {
    return /^tt\d+$/i.test((id || "").trim());
}

function matchesType(supportedTypes: unknown, type: CatalogType) {
    if (!Array.isArray(supportedTypes) || supportedTypes.length === 0) return true;
    return supportedTypes.some(
        (entry) => String(entry || "").toLowerCase().trim() === type,
    );
}

function matchesIdPrefix(prefixes: unknown, id: string) {
    if (!Array.isArray(prefixes) || prefixes.length === 0) return true;
    const normalizedId = (id || "").toLowerCase();
    return prefixes.some((prefix) =>
        normalizedId.startsWith(String(prefix || "").toLowerCase().trim()),
    );
}

type ResourceDescriptor = {
    name: string;
    types?: unknown;
    idPrefixes?: unknown;
};

function getResourceDescriptors(manifest: any): ResourceDescriptor[] {
    const resources = Array.isArray(manifest?.resources) ? manifest.resources : [];
    const defaultTypes = manifest?.types;
    const defaultPrefixes = manifest?.idPrefixes;

    return resources
        .map((resource: any) => {
            if (typeof resource === "string") {
                return {
                    name: resource.toLowerCase(),
                    types: defaultTypes,
                    idPrefixes: defaultPrefixes,
                };
            }
            if (resource && typeof resource === "object") {
                return {
                    name: String(resource.name || "").toLowerCase(),
                    types: resource.types ?? defaultTypes,
                    idPrefixes: resource.idPrefixes ?? defaultPrefixes,
                };
            }
            return null;
        })
        .filter((resource): resource is ResourceDescriptor => resource !== null);
}

function addonSupportsMeta(addon: Addon, id: string, type: CatalogType) {
    const descriptors = getResourceDescriptors(addon?.manifest).filter(
        (descriptor) => descriptor.name === "meta",
    );

    if (descriptors.length === 0) return false;
    return descriptors.some(
        (descriptor) =>
            matchesType(descriptor.types, type) &&
            matchesIdPrefix(descriptor.idPrefixes, id),
    );
}

async function fetchJson(url: string) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { accept: "application/json" },
        });
        if (!response.ok) {
            throw new Error(`Request failed: ${response.status}`);
        }
        return await response.json();
    } finally {
        clearTimeout(timeoutId);
    }
}

function normalizeMetaPayload(payload: any, fallbackId: string, fallbackType: CatalogType): ShowResponse | null {
    if (!payload || typeof payload !== "object" || !payload.meta || typeof payload.meta !== "object") {
        return null;
    }

    const rawMeta = payload.meta as any;
    const normalizedId = String(rawMeta.imdb_id ?? rawMeta.id ?? fallbackId).trim();
    if (!normalizedId) return null;

    const normalizedMeta = {
        ...rawMeta,
        imdb_id: normalizedId,
        id: String(rawMeta.id ?? normalizedId),
        type: String(rawMeta.type ?? fallbackType),
    };

    return { ...payload, meta: normalizedMeta } as ShowResponse;
}

async function fetchCinemetaMeta(imdbId: string, type: CatalogType): Promise<ShowResponse> {
    const metaUrl = `${CINEMETA_BASE_URL}/meta/${type}/${encodeURIComponent(imdbId)}.json`;
    const payload = await fetchJson(metaUrl);
    const normalized = normalizeMetaPayload(payload, imdbId, type);
    if (!normalized) {
        throw new Error(`Invalid Cinemeta payload for ID: ${imdbId}`);
    }
    return normalized;
}

async function fetchAddonMeta(addon: Addon, imdbId: string, type: CatalogType): Promise<ShowResponse | null> {
    const baseUrl = normalizeAddonBaseUrl(addon.transport_url);
    if (!baseUrl) return null;

    try {
        const metaUrl = `${baseUrl}/meta/${encodeURIComponent(type)}/${encodeURIComponent(imdbId)}.json`;
        const payload = await fetchJson(metaUrl);
        return normalizeMetaPayload(payload, imdbId, type);
    } catch {
        return null;
    }
}

async function fetchFirstAddonMeta(imdbId: string, type: CatalogType): Promise<ShowResponse | null> {
    let addons: Addon[] = [];
    try {
        addons = await getAddons();
    } catch {
        return null;
    }

    const candidates = addons.filter((addon) => addonSupportsMeta(addon, imdbId, type));
    if (candidates.length === 0) return null;

    return new Promise<ShowResponse | null>((resolve) => {
        let pending = candidates.length;
        let found = false;

        for (const addon of candidates) {
            fetchAddonMeta(addon, imdbId, type)
                .then((payload) => {
                    if (found) return;
                    if (payload) {
                        found = true;
                        resolve(payload);
                        return;
                    }
                    pending -= 1;
                    if (pending === 0) resolve(null);
                })
                .catch(() => {
                    pending -= 1;
                    if (!found && pending === 0) resolve(null);
                });
        }
    });
}

export const getMetaData = async (imdbId: string, type: string): Promise<ShowResponse> => {
    const normalizedType = normalizeType(type);
    const titleId = String(imdbId || "").trim();

    if (!titleId) {
        throw new Error("Missing title ID");
    }

    // For non-IMDb IDs, prefer addon metadata first because Cinemeta is tt-focused.
    if (!isLikelyImdbId(titleId)) {
        const addonMeta = await fetchFirstAddonMeta(titleId, normalizedType);
        if (addonMeta) return addonMeta;
    }

    try {
        return await fetchCinemetaMeta(titleId, normalizedType);
    } catch (cinemetaError) {
        const addonMeta = await fetchFirstAddonMeta(titleId, normalizedType);
        if (addonMeta) return addonMeta;
        throw cinemetaError;
    }
}

export const getPopularTitles = async (type: string): Promise<PopularTitleMeta[]> => {
    const popularUrl = `${CINEMETA_BASE_URL}/catalog/${type}/popular.json`;

    const payload = await fetchJson(popularUrl);
    return Array.isArray(payload?.metas) ? payload.metas : [];
}

function mapSearchMeta(meta: any, fallbackType: CatalogType): SearchTitleResult | null {
    const id = String(meta?.imdb_id ?? meta?.id ?? "").trim();
    if (!id) return null;

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

function addonHasCatalogResource(addon: Addon) {
    const resources = Array.isArray(addon?.manifest?.resources)
        ? addon.manifest.resources
        : [];
    if (resources.length === 0) return true;
    return resources.some((resource: any) => {
        if (typeof resource === "string") {
            return resource.toLowerCase() === "catalog";
        }
        if (resource && typeof resource === "object") {
            return String(resource.name || "").toLowerCase() === "catalog";
        }
        return false;
    });
}

function normalizeCatalogType(type: unknown): CatalogType | null {
    const value = String(type ?? "").trim().toLowerCase();
    if (value === "movie" || value === "series") return value;
    return null;
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

function mergeSearchResults(
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
    return Array.from(merged.values()).slice(0, SEARCH_LIMIT);
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
        if (cached.data.movies.length > 0 || cached.data.series.length > 0) {
            return cached.data;
        }
        if (cached.promise) return cached.promise;
    }

    const promise = (async () => {
        const addons = await getAddons().catch(() => [] as Addon[]);
        const [movies, series] = await Promise.all([
            searchAddonCatalogsByType("movie", trimmed, addons),
            searchAddonCatalogsByType("series", trimmed, addons),
        ]);
        const result = { movies, series };
        addonSearchCache.set(cacheKey, {
            timestamp: Date.now(),
            data: result,
        });
        return result;
    })();

    addonSearchCache.set(cacheKey, {
        timestamp: Date.now(),
        data: { movies: [], series: [] },
        promise,
    });

    return promise;
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
