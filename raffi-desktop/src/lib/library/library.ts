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

export const searchTitlesSplit = async (query: string): Promise<SplitSearchResults> => {
    const trimmed = (query || "").trim();
    if (!trimmed) return { movies: [], series: [] };

    const [movies, series] = await Promise.all([
        searchCinemetaByType("movie", trimmed),
        searchCinemetaByType("series", trimmed),
    ]);

    return { movies, series };
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
