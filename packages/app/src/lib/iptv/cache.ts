import type {
    IptvChannel,
    IptvGroup,
    IptvRefreshResult,
    IptvRefreshStats,
    IptvSource,
} from "./types";

const IPTV_REFRESH_CACHE_KEY_PREFIX = "raffi_iptv_refresh_result_v1";
const CACHE_VERSION = 1;

type StoredIptvRefreshResult = {
    version: typeof CACHE_VERSION;
    sourceId: string;
    m3uUrl: string;
    epgUrl: string | null;
    channels: IptvChannel[];
    groups: IptvGroup[];
    loadedAt: string;
    stats: IptvRefreshStats;
};

function getStorage(): Storage | null {
    try {
        return typeof localStorage !== "undefined" ? localStorage : null;
    } catch {
        return null;
    }
}

function cacheKeyForSourceId(sourceId: string): string {
    return `${IPTV_REFRESH_CACHE_KEY_PREFIX}:${sourceId}`;
}

function normalizeOptionalUrl(url: string | undefined): string | null {
    const trimmed = String(url ?? "").trim();
    return trimmed || null;
}

function getSourceUrls(source: IptvSource) {
    return {
        m3uUrl: source.m3uUrl.trim(),
        epgUrl: normalizeOptionalUrl(source.epgUrl),
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
    return typeof value === "string" && value ? value : undefined;
}

function sanitizeChannel(value: unknown): IptvChannel | null {
    if (!isRecord(value)) return null;
    if (
        typeof value.id !== "string" ||
        typeof value.sourceId !== "string" ||
        typeof value.name !== "string" ||
        typeof value.url !== "string" ||
        typeof value.group !== "string" ||
        typeof value.order !== "number" ||
        !Number.isFinite(value.order)
    ) {
        return null;
    }

    return {
        id: value.id,
        sourceId: value.sourceId,
        name: value.name,
        url: value.url,
        group: value.group,
        tvgId: optionalString(value.tvgId),
        tvgName: optionalString(value.tvgName),
        logo: optionalString(value.logo),
        number: optionalString(value.number),
        order: value.order,
    };
}

function sanitizeGroup(value: unknown): IptvGroup | null {
    if (!isRecord(value)) return null;
    if (
        typeof value.id !== "string" ||
        typeof value.sourceId !== "string" ||
        typeof value.name !== "string" ||
        typeof value.channelCount !== "number" ||
        typeof value.order !== "number" ||
        !Number.isFinite(value.channelCount) ||
        !Number.isFinite(value.order)
    ) {
        return null;
    }

    return {
        id: value.id,
        sourceId: value.sourceId,
        name: value.name,
        channelCount: value.channelCount,
        order: value.order,
    };
}

function sanitizeStats(value: unknown): IptvRefreshStats | null {
    if (!isRecord(value)) return null;
    if (
        typeof value.channelCount !== "number" ||
        typeof value.groupCount !== "number" ||
        typeof value.programmeCount !== "number" ||
        !Number.isFinite(value.channelCount) ||
        !Number.isFinite(value.groupCount) ||
        !Number.isFinite(value.programmeCount)
    ) {
        return null;
    }

    return {
        channelCount: value.channelCount,
        groupCount: value.groupCount,
        programmeCount: value.programmeCount,
    };
}

function sanitizeStoredResult(value: unknown): StoredIptvRefreshResult | null {
    if (!isRecord(value)) return null;
    if (
        value.version !== CACHE_VERSION ||
        typeof value.sourceId !== "string" ||
        typeof value.m3uUrl !== "string" ||
        (value.epgUrl !== null && typeof value.epgUrl !== "string") ||
        typeof value.loadedAt !== "string" ||
        !Array.isArray(value.channels) ||
        !Array.isArray(value.groups)
    ) {
        return null;
    }

    const channels = value.channels.map(sanitizeChannel);
    const groups = value.groups.map(sanitizeGroup);
    const stats = sanitizeStats(value.stats);
    if (!stats || channels.some((channel) => !channel) || groups.some((group) => !group)) {
        return null;
    }

    return {
        version: CACHE_VERSION,
        sourceId: value.sourceId,
        m3uUrl: value.m3uUrl,
        epgUrl: value.epgUrl,
        channels: channels as IptvChannel[],
        groups: groups as IptvGroup[],
        loadedAt: value.loadedAt,
        stats,
    };
}

function storedResultMatchesSource(source: IptvSource, stored: StoredIptvRefreshResult): boolean {
    const urls = getSourceUrls(source);
    return (
        stored.sourceId === source.id &&
        stored.m3uUrl === urls.m3uUrl &&
        stored.epgUrl === urls.epgUrl
    );
}

export function persistIptvRefreshResult(source: IptvSource, result: IptvRefreshResult): void {
    const storage = getStorage();
    if (!storage) return;

    const urls = getSourceUrls(source);
    const stored: StoredIptvRefreshResult = {
        version: CACHE_VERSION,
        sourceId: source.id,
        m3uUrl: urls.m3uUrl,
        epgUrl: urls.epgUrl,
        channels: result.channels,
        groups: result.groups,
        loadedAt: result.loadedAt,
        stats: result.stats,
    };

    try {
        storage.setItem(cacheKeyForSourceId(source.id), JSON.stringify(stored));
    } catch {
        // Best-effort cache writes should not block Live TV refreshes.
    }
}

export function getStoredIptvRefreshResult(source: IptvSource): IptvRefreshResult | null {
    const storage = getStorage();
    if (!storage) return null;

    try {
        const raw = storage.getItem(cacheKeyForSourceId(source.id));
        if (!raw) return null;

        const stored = sanitizeStoredResult(JSON.parse(raw));
        if (!stored || !storedResultMatchesSource(source, stored)) {
            return null;
        }

        return {
            channels: stored.channels,
            groups: stored.groups,
            loadedAt: stored.loadedAt,
            stats: stored.stats,
        };
    } catch {
        return null;
    }
}

export function clearStoredIptvRefreshResult(sourceId: string): void {
    const storage = getStorage();
    if (!storage) return;
    storage.removeItem(cacheKeyForSourceId(sourceId));
}
