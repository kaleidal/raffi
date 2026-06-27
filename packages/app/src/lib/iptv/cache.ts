import type {
    IptvChannel,
    IptvGroup,
    IptvRefreshResult,
    IptvRefreshStats,
    IptvSource,
    IptvSourceKind,
    XmltvGuide,
    XmltvProgramme,
} from "./types";
import { normalizeIptvText } from "./utils";
import { normalizeXtreamServerUrl } from "./xtream";

const IPTV_REFRESH_CACHE_KEY_PREFIX = "raffi_iptv_refresh_result_v1";
const CACHE_VERSION = 1;

type StoredXmltvChannel = {
    id: string;
    displayNames: string[];
};

type StoredXmltvProgramme = {
    channelId: string;
    start: string;
    stop: string;
    startOffsetMinutes?: number;
    stopOffsetMinutes?: number;
    title: string;
    subTitle?: string;
    description?: string;
};

type StoredXmltvGuide = {
    channels: StoredXmltvChannel[];
    programmesByChannel: Record<string, StoredXmltvProgramme[]>;
};

type StoredIptvRefreshResult = {
    version: typeof CACHE_VERSION;
    sourceId: string;
    sourceKind: IptvSourceKind;
    m3uUrl?: string;
    epgUrl?: string | null;
    serverUrl?: string;
    credentialFingerprint?: string;
    channels: IptvChannel[];
    groups: IptvGroup[];
    guide?: StoredXmltvGuide;
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

function hashString(input: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

function fingerprintXtreamCredentials(source: IptvSource): string {
    if (source.kind !== "xtream") return "";
    return hashString(
        [
            normalizeXtreamServerUrl(source.serverUrl),
            source.username,
            source.credential,
        ].join("\n"),
    );
}

export function getIptvSourceCacheFingerprint(source: IptvSource): string {
    if (source.kind === "xtream") {
        return [
            source.kind,
            normalizeXtreamServerUrl(source.serverUrl),
            fingerprintXtreamCredentials(source),
        ].join("\n");
    }

    return [
        source.kind,
        source.m3uUrl.trim(),
        normalizeOptionalUrl(source.epgUrl) ?? "",
    ].join("\n");
}

function getStoredSourceMetadata(source: IptvSource) {
    if (source.kind === "xtream") {
        return {
            sourceKind: source.kind,
            serverUrl: normalizeXtreamServerUrl(source.serverUrl),
            credentialFingerprint: fingerprintXtreamCredentials(source),
        };
    }

    return {
        sourceKind: source.kind,
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

function isValidDateString(value: string): boolean {
    return !Number.isNaN(new Date(value).getTime());
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

function optionalNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sanitizeStoredProgramme(value: unknown): XmltvProgramme | null {
    if (!isRecord(value)) return null;
    if (
        typeof value.channelId !== "string" ||
        typeof value.start !== "string" ||
        typeof value.stop !== "string" ||
        typeof value.title !== "string" ||
        !isValidDateString(value.start) ||
        !isValidDateString(value.stop)
    ) {
        return null;
    }

    return {
        channelId: value.channelId,
        start: new Date(value.start),
        stop: new Date(value.stop),
        startOffsetMinutes: optionalNumber(value.startOffsetMinutes),
        stopOffsetMinutes: optionalNumber(value.stopOffsetMinutes),
        title: value.title,
        subTitle: optionalString(value.subTitle),
        description: optionalString(value.description),
    };
}

function sanitizeStoredProgrammes(value: unknown): XmltvProgramme[] | null {
    if (!Array.isArray(value)) return null;

    const programmes: XmltvProgramme[] = [];
    for (const rawProgramme of value) {
        const programme = sanitizeStoredProgramme(rawProgramme);
        if (!programme) return null;
        programmes.push(programme);
    }

    return programmes.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function sanitizeStoredGuide(value: unknown): XmltvGuide | null | undefined {
    if (value === undefined) return undefined;
    if (!isRecord(value) || !Array.isArray(value.channels) || !isRecord(value.programmesByChannel)) {
        return null;
    }

    const guide: XmltvGuide = {
        channels: new Map(),
        programmesByChannel: new Map(),
        displayNameToChannelId: new Map(),
    };

    for (const channel of value.channels) {
        if (!isRecord(channel) || typeof channel.id !== "string" || !Array.isArray(channel.displayNames)) {
            return null;
        }
        const displayNames = channel.displayNames.filter(
            (displayName): displayName is string => typeof displayName === "string" && Boolean(displayName.trim()),
        );
        guide.channels.set(channel.id, { id: channel.id, displayNames });
        for (const displayName of displayNames) {
            const key = normalizeIptvText(displayName);
            if (key && !guide.displayNameToChannelId.has(key)) {
                guide.displayNameToChannelId.set(key, channel.id);
            }
        }
    }

    for (const [channelId, rawProgrammes] of Object.entries(value.programmesByChannel)) {
        const programmes = sanitizeStoredProgrammes(rawProgrammes);
        if (!programmes) return null;
        guide.programmesByChannel.set(channelId, programmes);
    }

    return guide;
}

function serializeProgramme(programme: XmltvProgramme): StoredXmltvProgramme {
    return {
        channelId: programme.channelId,
        start: programme.start.toISOString(),
        stop: programme.stop.toISOString(),
        startOffsetMinutes: programme.startOffsetMinutes,
        stopOffsetMinutes: programme.stopOffsetMinutes,
        title: programme.title,
        subTitle: programme.subTitle,
        description: programme.description,
    };
}

function serializeGuide(guide: XmltvGuide | undefined): StoredXmltvGuide | undefined {
    if (!guide) return undefined;

    const programmesByChannel: Record<string, StoredXmltvProgramme[]> = {};
    for (const [channelId, programmes] of guide.programmesByChannel.entries()) {
        programmesByChannel[channelId] = programmes.map(serializeProgramme);
    }

    return {
        channels: Array.from(guide.channels.values()).map((channel) => ({
            id: channel.id,
            displayNames: channel.displayNames,
        })),
        programmesByChannel,
    };
}

type HydratedStoredIptvRefreshResult = Omit<StoredIptvRefreshResult, "guide"> & {
    guide?: XmltvGuide;
};

function sanitizeStoredResult(value: unknown): HydratedStoredIptvRefreshResult | null {
    if (!isRecord(value)) return null;
    if (
        value.version !== CACHE_VERSION ||
        typeof value.sourceId !== "string" ||
        typeof value.loadedAt !== "string" ||
        !isValidDateString(value.loadedAt) ||
        !Array.isArray(value.channels) ||
        !Array.isArray(value.groups)
    ) {
        return null;
    }

    const sourceKind = value.sourceKind === "xtream" ? "xtream" : "m3u";
    if (
        sourceKind === "xtream" &&
        (typeof value.serverUrl !== "string" ||
            typeof value.credentialFingerprint !== "string")
    ) {
        return null;
    }

    if (
        sourceKind === "m3u" &&
        (typeof value.m3uUrl !== "string" ||
            (value.epgUrl !== null && typeof value.epgUrl !== "string"))
    ) {
        return null;
    }

    const channels = value.channels.map(sanitizeChannel);
    const groups = value.groups.map(sanitizeGroup);
    const stats = sanitizeStats(value.stats);
    const guide = sanitizeStoredGuide(value.guide);
    if (
        !stats ||
        guide === null ||
        channels.some((channel) => !channel) ||
        groups.some((group) => !group)
    ) {
        return null;
    }

    const sanitizedChannels = channels as IptvChannel[];
    const sanitizedGroups = groups as IptvGroup[];
    if (
        sanitizedChannels.some((channel) => channel.sourceId !== value.sourceId) ||
        sanitizedGroups.some((group) => group.sourceId !== value.sourceId)
    ) {
        return null;
    }

    return {
        version: CACHE_VERSION,
        sourceId: value.sourceId,
        sourceKind,
        m3uUrl: typeof value.m3uUrl === "string" ? value.m3uUrl : undefined,
        epgUrl:
            typeof value.epgUrl === "string" || value.epgUrl === null
                ? value.epgUrl
                : undefined,
        serverUrl: typeof value.serverUrl === "string" ? value.serverUrl : undefined,
        credentialFingerprint:
            typeof value.credentialFingerprint === "string"
                ? value.credentialFingerprint
                : undefined,
        channels: sanitizedChannels,
        groups: sanitizedGroups,
        guide,
        loadedAt: value.loadedAt,
        stats,
    };
}

function storedResultMatchesSource(source: IptvSource, stored: HydratedStoredIptvRefreshResult): boolean {
    if (stored.sourceId !== source.id || stored.sourceKind !== source.kind) return false;

    const metadata = getStoredSourceMetadata(source);
    if (source.kind === "xtream") {
        return (
            stored.serverUrl === metadata.serverUrl &&
            stored.credentialFingerprint === metadata.credentialFingerprint
        );
    }

    return stored.m3uUrl === metadata.m3uUrl && stored.epgUrl === metadata.epgUrl;
}

export function persistIptvRefreshResult(source: IptvSource, result: IptvRefreshResult): void {
    const storage = getStorage();
    if (!storage) return;

    if (source.kind === "xtream") {
        try {
            storage.removeItem(cacheKeyForSourceId(source.id));
        } catch {
            // Best-effort cache clears should not block Live TV refreshes.
        }
        return;
    }

    const stored: StoredIptvRefreshResult = {
        version: CACHE_VERSION,
        sourceId: source.id,
        ...getStoredSourceMetadata(source),
        channels: result.channels,
        groups: result.groups,
        guide: serializeGuide(result.guide),
        loadedAt: result.loadedAt,
        stats: result.stats,
    };

    try {
        storage.setItem(cacheKeyForSourceId(source.id), JSON.stringify(stored));
    } catch {
        try {
            const fallbackStored = { ...stored };
            delete fallbackStored.guide;
            storage.setItem(cacheKeyForSourceId(source.id), JSON.stringify(fallbackStored));
        } catch {
            // Best-effort cache writes should not block Live TV refreshes.
        }
    }
}

export function getStoredIptvRefreshResult(source: IptvSource): IptvRefreshResult | null {
    const storage = getStorage();
    if (!storage) return null;

    if (source.kind === "xtream") {
        try {
            storage.removeItem(cacheKeyForSourceId(source.id));
        } catch {
            // Ignore unavailable storage when discarding old Xtream caches.
        }
        return null;
    }

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
            guide: stored.guide,
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
