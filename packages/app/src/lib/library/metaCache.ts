import type { ShowResponse } from "./types/meta_types";
import { getMetaData } from "./library";

interface CachedMeta {
  data: ShowResponse;
  timestamp: number;
}

interface MetaCacheOptions {
  allowStale?: boolean;
}

const CACHE_TTL = 1000 * 60 * 60;
const MAX_CACHE_SIZE = 500;
const IDB_NAME = "raffi-meta-cache";
const IDB_STORE = "meta";
const IDB_VERSION = 1;

const metaCache = new Map<string, CachedMeta>();
const pendingRequests = new Map<string, Promise<ShowResponse>>();

let dbPromise: Promise<IDBDatabase> | null = null;

function openMetaDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("indexedDB unavailable"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(IDB_NAME, IDB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("indexedDB open failed"));
    });
  }
  return dbPromise;
}

async function readFromIdb(cacheKey: string): Promise<CachedMeta | null> {
  try {
    const db = await openMetaDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const request = store.get(cacheKey);
      request.onsuccess = () => {
        const value = request.result as CachedMeta | undefined;
        resolve(value ?? null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

async function writeToIdb(cacheKey: string, entry: CachedMeta): Promise<void> {
  try {
    const db = await openMetaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      store.put(entry, cacheKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore quota / private-mode failures
  }
}

function trimMemoryCache() {
  while (metaCache.size > MAX_CACHE_SIZE) {
    const oldestKey = metaCache.keys().next().value;
    if (!oldestKey) break;
    metaCache.delete(oldestKey);
  }
}

export async function getCachedMetaData(
  imdbId: string,
  type: string,
  options: MetaCacheOptions = {},
): Promise<ShowResponse> {
  const cacheKey = `${type}:${imdbId}`;
  const canUse = (entry: CachedMeta) =>
    options.allowStale || Date.now() - entry.timestamp < CACHE_TTL;

  const cached = metaCache.get(cacheKey);
  if (cached && canUse(cached)) {
    return cached.data;
  }

  const stored = await readFromIdb(cacheKey);
  if (stored && canUse(stored)) {
    metaCache.set(cacheKey, stored);
    trimMemoryCache();
    return stored.data;
  }

  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey)!;
  }

  const promise = getMetaData(imdbId, type);
  pendingRequests.set(cacheKey, promise);

  try {
    const data = await promise;
    const entry: CachedMeta = { data, timestamp: Date.now() };
    metaCache.set(cacheKey, entry);
    trimMemoryCache();
    void writeToIdb(cacheKey, entry);
    return data;
  } finally {
    pendingRequests.delete(cacheKey);
  }
}
