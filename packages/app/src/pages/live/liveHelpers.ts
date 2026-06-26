import { getIptvSourceCacheFingerprint } from "../../lib/iptv/cache";
import type { GuideGridViewport } from "../../lib/iptv/guideGrid";
import type {
    IptvChannel,
    IptvRefreshResult,
    IptvSource,
} from "../../lib/iptv/types";

export const ALL_GROUPS = "__all__";
export const GUIDE_VIEWPORT_HOURS = 2;
export const GUIDE_INITIAL_CHANNEL_LIMIT = 100;
export const GUIDE_CHANNEL_PAGE_SIZE = 100;

export interface GuideTimeTick {
    value: Date;
    label: string;
    leftPercent: number;
}

export function getVisibleChannels(
    channels: IptvChannel[],
    group: string,
    query: string,
) {
    const normalizedQuery = query.trim().toLowerCase();
    return channels.filter((channel) => {
        if (group !== ALL_GROUPS && channel.group !== group) return false;
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
