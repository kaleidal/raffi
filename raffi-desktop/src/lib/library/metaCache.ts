import type { ShowResponse } from './types/meta_types';
import { getMetaData } from './library';

interface CachedMeta {
    data: ShowResponse;
    timestamp: number;
}

const CACHE_TTL = 1000 * 60 * 60; // 1 hour
const MAX_CACHE_SIZE = 500;
const metaCache = new Map<string, CachedMeta>();

// Pending requests to prevent duplicate in-flight requests
const pendingRequests = new Map<string, Promise<ShowResponse>>();

export async function getCachedMetaData(imdbId: string, type: string): Promise<ShowResponse> {
    const cacheKey = `${type}:${imdbId}`;

    const cached = metaCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }

    try {
        const stored = localStorage.getItem(`meta:${cacheKey}`);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Date.now() - parsed.timestamp < CACHE_TTL) {
                metaCache.set(cacheKey, parsed);
                return parsed.data;
            }
        }
    } catch (e) {
        // Ignore localStorage errors (quota exceeded, etc.)
    }

    if (pendingRequests.has(cacheKey)) {
        return pendingRequests.get(cacheKey)!;
    }
    const promise = getMetaData(imdbId, type);
    pendingRequests.set(cacheKey, promise);

    try {
        const data = await promise;

        metaCache.set(cacheKey, { data, timestamp: Date.now() });

        if (metaCache.size > MAX_CACHE_SIZE) {
            const oldestKey = metaCache.keys().next().value;
            if (oldestKey) {
                metaCache.delete(oldestKey);
            }
        }

        try {
            localStorage.setItem(`meta:${cacheKey}`, JSON.stringify({
                data,
                timestamp: Date.now()
            }));
        } catch (e) {
            // Ignore localStorage quota errors
        }

        return data;
    } finally {
        pendingRequests.delete(cacheKey);
    }
}

// Clear cache (useful for debugging or forced refresh)
export function clearMetaCache() {
    metaCache.clear();
    try {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith('meta:')) {
                localStorage.removeItem(key);
            }
        });
    } catch (e) {
        // Ignore errors
    }
}

// Preload metadata for multiple items (batching)
export async function preloadMetaData(items: Array<{ imdbId: string; type: string }>) {
    const promises = items.map(item => getCachedMetaData(item.imdbId, item.type));
    return Promise.allSettled(promises);
}
