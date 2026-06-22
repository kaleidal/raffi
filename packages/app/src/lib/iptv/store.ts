import { writable } from "svelte/store";
import type { IptvSource } from "./types";
import { validateIptvUrl } from "./fetch";

export const IPTV_SOURCES_STORAGE_KEY = "raffi_iptv_sources_v1";

type SourceInput = {
    name: string;
    m3uUrl: string;
    epgUrl?: string | null;
};

function createId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    return `iptv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getStorage(): Storage | null {
    try {
        return typeof localStorage !== "undefined" ? localStorage : null;
    } catch {
        return null;
    }
}

function sanitizeSource(value: any): IptvSource | null {
    if (!value || typeof value !== "object") return null;
    if (value.kind !== "m3u") return null;
    if (typeof value.id !== "string" || !value.id.trim()) return null;
    if (typeof value.name !== "string" || !value.name.trim()) return null;
    if (typeof value.m3uUrl !== "string" || !value.m3uUrl.trim()) return null;

    try {
        const m3uUrl = validateIptvUrl(value.m3uUrl);
        const epgUrl =
            typeof value.epgUrl === "string" && value.epgUrl.trim()
                ? validateIptvUrl(value.epgUrl)
                : undefined;
        const now = new Date().toISOString();

        return {
            id: value.id.trim(),
            name: value.name.trim(),
            kind: "m3u",
            m3uUrl,
            epgUrl,
            createdAt: typeof value.createdAt === "string" ? value.createdAt : now,
            updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : now,
        };
    } catch {
        return null;
    }
}

function persistSources(sources: IptvSource[]) {
    const storage = getStorage();
    if (!storage) return;
    storage.setItem(IPTV_SOURCES_STORAGE_KEY, JSON.stringify(sources));
}

function setSources(sources: IptvSource[]) {
    persistSources(sources);
    iptvSources.set(sources);
}

export function getStoredIptvSources(): IptvSource[] {
    const storage = getStorage();
    if (!storage) return [];

    try {
        const raw = storage.getItem(IPTV_SOURCES_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(sanitizeSource).filter(Boolean) as IptvSource[];
    } catch {
        return [];
    }
}

function normalizeSourceInput(input: SourceInput) {
    const name = String(input.name ?? "").trim();
    if (!name) {
        throw new Error("Enter a source name");
    }

    const m3uUrl = validateIptvUrl(input.m3uUrl);
    const epgUrl =
        typeof input.epgUrl === "string" && input.epgUrl.trim()
            ? validateIptvUrl(input.epgUrl)
            : undefined;

    return { name, m3uUrl, epgUrl };
}

export const iptvSources = writable<IptvSource[]>(getStoredIptvSources());

export function addIptvSource(input: SourceInput): IptvSource {
    const normalized = normalizeSourceInput(input);
    const now = new Date().toISOString();
    const source: IptvSource = {
        id: createId(),
        kind: "m3u",
        name: normalized.name,
        m3uUrl: normalized.m3uUrl,
        epgUrl: normalized.epgUrl,
        createdAt: now,
        updatedAt: now,
    };

    setSources([...getStoredIptvSources(), source]);
    return source;
}

export function updateIptvSource(
    sourceId: string,
    input: Partial<SourceInput>,
): IptvSource | null {
    const sources = getStoredIptvSources();
    const existing = sources.find((source) => source.id === sourceId);
    if (!existing) return null;

    const normalized = normalizeSourceInput({
        name: input.name ?? existing.name,
        m3uUrl: input.m3uUrl ?? existing.m3uUrl,
        epgUrl: input.epgUrl === undefined ? existing.epgUrl : input.epgUrl,
    });

    const updated: IptvSource = {
        ...existing,
        name: normalized.name,
        m3uUrl: normalized.m3uUrl,
        epgUrl: normalized.epgUrl,
        updatedAt: new Date().toISOString(),
    };

    setSources(sources.map((source) => (source.id === sourceId ? updated : source)));
    return updated;
}

export function removeIptvSource(sourceId: string): void {
    setSources(getStoredIptvSources().filter((source) => source.id !== sourceId));
}
