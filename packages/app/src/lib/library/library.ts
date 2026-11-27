import type { ShowResponse } from "./types/meta_types";
import type { PopularTitleMeta } from "./types/popular_types";
import { addonSupportsMeta, normalizeAddonBaseUrl, type CatalogType } from "./addonManifest";
import { getAddons, type Addon } from "../db/db";

export const CINEMETA_BASE_URL = "https://v3-cinemeta.strem.io";
const REQUEST_TIMEOUT_MS = 9000;
const POPULAR_CACHE_TTL_MS = 60 * 60 * 1000;

function normalizeType(type: string): CatalogType {
    return type === "series" ? "series" : "movie";
}

function isLikelyImdbId(id: string) {
    return /^tt\d+$/i.test((id || "").trim());
}

export async function fetchJson(url: string) {
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

function getPopularCacheKey(type: string) {
    return `popular:${normalizeType(type)}`;
}

function readPopularCache(type: string): PopularTitleMeta[] | null {
    if (typeof localStorage === "undefined") return null;
    try {
        const raw = localStorage.getItem(getPopularCacheKey(type));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed?.data)) return null;
        if (Date.now() - Number(parsed.timestamp || 0) > POPULAR_CACHE_TTL_MS) {
            return null;
        }
        return parsed.data;
    } catch {
        return null;
    }
}

function writePopularCache(type: string, data: PopularTitleMeta[]) {
    if (typeof localStorage === "undefined") return;
    try {
        localStorage.setItem(
            getPopularCacheKey(type),
            JSON.stringify({ data, timestamp: Date.now() }),
        );
    } catch {}
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
    const addons = await getAddons();
    const candidates = addons.filter((addon) => addonSupportsMeta(addon, imdbId, type));
    if (candidates.length === 0) return null;

    return new Promise<ShowResponse | null>((resolve) => {
        let pending = candidates.length;
        let found = false;

        for (const addon of candidates) {
            void fetchAddonMeta(addon, imdbId, type).then((payload) => {
                if (found) return;
                if (payload) {
                    found = true;
                    resolve(payload);
                    return;
                }
                pending -= 1;
                if (pending === 0) resolve(null);
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
    const cached = readPopularCache(type);
    if (cached) return cached;

    const popularUrl = `${CINEMETA_BASE_URL}/catalog/${type}/popular.json`;

    try {
        const payload = await fetchJson(popularUrl);
        const titles = Array.isArray(payload?.metas) ? payload.metas : [];
        writePopularCache(type, titles);
        return titles;
    } catch (error) {
        return readPopularCache(type) ?? Promise.reject(error);
    }
}
