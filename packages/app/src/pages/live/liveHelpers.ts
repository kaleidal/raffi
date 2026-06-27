import { getIptvSourceCacheFingerprint } from "../../lib/iptv/cache";
import type { GuideGridViewport } from "../../lib/iptv/guideGrid";
import type {
    IptvChannel,
    IptvRefreshResult,
    IptvSource,
} from "../../lib/iptv/types";

export const ALL_GROUPS = "__all__";
export const FAVORITES_GROUP = "__favorites__";
export const FAVORITES_GROUP_LABEL = "Favorites";
export const GUIDE_VIEWPORT_HOURS = 2;
export const GUIDE_INITIAL_CHANNEL_LIMIT = 100;
export const GUIDE_CHANNEL_PAGE_SIZE = 100;
export const LIVE_TV_SELECTION_STORAGE_KEY = "raffi_live_tv_selection_v1";
export const LIVE_TV_REFRESH_INTERVAL_MS = 6 * 60 * 60_000;
export const LIVE_TV_REFRESH_CHECK_INTERVAL_MS = 60_000;
export const LIVE_TV_AUTO_REFRESH_RETRY_MS = 15 * 60_000;

export interface GuideTimeTick {
    value: Date;
    label: string;
    leftPercent: number;
}

export interface LiveTvSelection {
    sourceId: string;
    groupsBySourceId: Record<string, string>;
    favoritesBySourceId: Record<string, string[]>;
}

function createDefaultLiveTvSelection(): LiveTvSelection {
    return { sourceId: "", groupsBySourceId: {}, favoritesBySourceId: {} };
}

function getStorage(): Storage | null {
    try {
        return typeof localStorage !== "undefined" ? localStorage : null;
    } catch {
        return null;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanStoredString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function cleanGroupsBySourceId(value: unknown): Record<string, string> {
    if (!isRecord(value)) {
        return {};
    }

    const groupsBySourceId: Record<string, string> = {};
    for (const [sourceId, group] of Object.entries(value)) {
        const cleanSourceId = cleanStoredString(sourceId);
        const cleanGroup = cleanStoredString(group);
        if (cleanSourceId && cleanGroup) {
            groupsBySourceId[cleanSourceId] = cleanGroup;
        }
    }
    return groupsBySourceId;
}

function cleanFavoriteChannelIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];

    return Array.from(
        new Set(
            value
                .map(cleanStoredString)
                .filter((channelId) => Boolean(channelId)),
        ),
    );
}

function cleanFavoritesBySourceId(value: unknown): Record<string, string[]> {
    if (!isRecord(value)) return {};

    const favoritesBySourceId: Record<string, string[]> = {};
    for (const [sourceId, channelIds] of Object.entries(value)) {
        const cleanSourceId = cleanStoredString(sourceId);
        const cleanChannelIds = cleanFavoriteChannelIds(channelIds);
        if (cleanSourceId && cleanChannelIds.length > 0) {
            favoritesBySourceId[cleanSourceId] = cleanChannelIds;
        }
    }
    return favoritesBySourceId;
}

export function getStoredLiveTvSelection(): LiveTvSelection {
    const storage = getStorage();
    if (!storage) {
        return createDefaultLiveTvSelection();
    }

    try {
        const raw = storage.getItem(LIVE_TV_SELECTION_STORAGE_KEY);
        if (!raw) {
            return createDefaultLiveTvSelection();
        }

        const parsed = JSON.parse(raw) as unknown;
        if (!isRecord(parsed)) {
            return createDefaultLiveTvSelection();
        }

        return {
            sourceId: cleanStoredString(parsed.sourceId),
            groupsBySourceId: cleanGroupsBySourceId(parsed.groupsBySourceId),
            favoritesBySourceId: cleanFavoritesBySourceId(parsed.favoritesBySourceId),
        };
    } catch {
        return createDefaultLiveTvSelection();
    }
}

function persistLiveTvSelection(selection: LiveTvSelection) {
    const storage = getStorage();
    if (!storage) return;

    try {
        storage.setItem(LIVE_TV_SELECTION_STORAGE_KEY, JSON.stringify(selection));
    } catch {
        // Live TV selection should stay usable even when persistence is unavailable.
    }
}

export function setStoredLiveTvSourceId(sourceId: string) {
    const selection = getStoredLiveTvSelection();
    selection.sourceId = sourceId.trim();
    persistLiveTvSelection(selection);
}

export function getStoredLiveTvGroup(sourceId: string) {
    const cleanSourceId = sourceId.trim();
    if (!cleanSourceId) return "";
    return getStoredLiveTvSelection().groupsBySourceId[cleanSourceId] ?? "";
}

export function setStoredLiveTvGroup(sourceId: string, group: string) {
    const cleanSourceId = sourceId.trim();
    const cleanGroup = group.trim();
    if (!cleanSourceId || !cleanGroup) return;

    const selection = getStoredLiveTvSelection();
    selection.groupsBySourceId[cleanSourceId] = cleanGroup;
    persistLiveTvSelection(selection);
}

export function getStoredLiveTvFavoriteChannelIds(sourceId: string) {
    const cleanSourceId = sourceId.trim();
    if (!cleanSourceId) return [];
    return getStoredLiveTvSelection().favoritesBySourceId[cleanSourceId] ?? [];
}

export function setStoredLiveTvFavoriteChannelIds(sourceId: string, channelIds: string[]) {
    const cleanSourceId = sourceId.trim();
    if (!cleanSourceId) return [];

    const selection = getStoredLiveTvSelection();
    const cleanChannelIds = cleanFavoriteChannelIds(channelIds);
    if (cleanChannelIds.length > 0) {
        selection.favoritesBySourceId[cleanSourceId] = cleanChannelIds;
    } else {
        delete selection.favoritesBySourceId[cleanSourceId];
    }
    persistLiveTvSelection(selection);
    return cleanChannelIds;
}

export function toggleStoredLiveTvFavoriteChannelId(sourceId: string, channelId: string) {
    const cleanChannelId = channelId.trim();
    if (!cleanChannelId) {
        return getStoredLiveTvFavoriteChannelIds(sourceId);
    }

    const current = getStoredLiveTvFavoriteChannelIds(sourceId);
    const next = current.includes(cleanChannelId)
        ? current.filter((favoriteChannelId) => favoriteChannelId !== cleanChannelId)
        : [...current, cleanChannelId];
    return setStoredLiveTvFavoriteChannelIds(sourceId, next);
}

export function isLiveTvRefreshDue(
    loadedAt: string | null | undefined,
    now: Date = new Date(),
): boolean {
    if (!loadedAt) return true;
    const loadedAtMs = new Date(loadedAt).getTime();
    if (!Number.isFinite(loadedAtMs)) return true;
    return now.getTime() - loadedAtMs >= LIVE_TV_REFRESH_INTERVAL_MS;
}

export function shouldAutoRefreshLiveTvSource(
    source: IptvSource,
    result: IptvRefreshResult | null,
    now: Date = new Date(),
): boolean {
    if (!result) return true;

    const sourceCanHaveGuide = source.kind === "xtream" || Boolean(source.epgUrl);
    const cachedStatsSayGuideExists = result.stats.programmeCount > 0;
    if (sourceCanHaveGuide && cachedStatsSayGuideExists && !result.guide) {
        return true;
    }

    return isLiveTvRefreshDue(result.loadedAt, now);
}

export function getVisibleChannels(
    channels: IptvChannel[],
    group: string,
    query: string,
    favoriteChannelIds: string[] = [],
) {
    const normalizedQuery = query.trim().toLowerCase();
    const favoriteChannelIdSet =
        group === FAVORITES_GROUP ? new Set(favoriteChannelIds) : null;
    return channels.filter((channel) => {
        if (favoriteChannelIdSet && !favoriteChannelIdSet.has(channel.id)) return false;
        if (!favoriteChannelIdSet && group !== ALL_GROUPS && channel.group !== group) return false;
        if (!normalizedQuery) return true;

        return (
            channel.name.toLowerCase().includes(normalizedQuery) ||
            channel.group.toLowerCase().includes(normalizedQuery) ||
            (channel.tvgName ?? "").toLowerCase().includes(normalizedQuery) ||
            (channel.tvgId ?? "").toLowerCase().includes(normalizedQuery)
        );
    });
}

export function getLiveSourceCacheKey(source: IptvSource) {
    return `${source.id}\n${getIptvSourceCacheFingerprint(source)}`;
}

export function getLiveSourceSummary(
    currentResult: IptvRefreshResult | null,
    selectedSource: IptvSource | null,
) {
    if (currentResult) {
        return `${currentResult.stats.channelCount} channels / ${currentResult.stats.groupCount} groups`;
    }

    return selectedSource
        ? "Refresh this source to load channels"
        : "Add a source to start watching";
}

export function getGuideViewport(now: Date): GuideGridViewport {
    const viewportStart = new Date(now);
    viewportStart.setMinutes(0, 0, 0);

    return {
        viewportStart,
        viewportEnd: new Date(
            viewportStart.getTime() + GUIDE_VIEWPORT_HOURS * 60 * 60_000,
        ),
        now,
    };
}

function getTimePercent(value: Date, viewport: GuideGridViewport) {
    const viewportStartMs = viewport.viewportStart.getTime();
    const viewportDurationMs = viewport.viewportEnd.getTime() - viewportStartMs;

    if (viewportDurationMs <= 0) return 0;

    return ((value.getTime() - viewportStartMs) / viewportDurationMs) * 100;
}

export function buildGuideTimeTicks(viewport: GuideGridViewport) {
    const ticks: GuideTimeTick[] = [];
    const tickMs = 30 * 60_000;

    for (
        let timestamp = viewport.viewportStart.getTime();
        timestamp <= viewport.viewportEnd.getTime();
        timestamp += tickMs
    ) {
        const value = new Date(timestamp);
        ticks.push({
            value,
            label: formatTime(value),
            leftPercent: getTimePercent(value, viewport),
        });
    }

    return ticks;
}

export function formatTime(value: Date) {
    return new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
    }).format(value);
}

export function formatLoadedAt(value: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return "Unknown";
    }

    return new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
    }).format(parsed);
}
