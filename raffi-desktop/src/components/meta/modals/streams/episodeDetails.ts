import type { ProgressItem, ProgressMap } from "../../../../pages/meta/types";
import type { EpisodeProgressDetails, ReleaseInfo } from "./types";

const relativeTimeFormatter =
    typeof Intl !== "undefined"
        ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
        : null;

const absoluteDateFormatter =
    typeof Intl !== "undefined"
        ? new Intl.DateTimeFormat(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric",
          })
        : null;

const RELATIVE_TIME_DIVISIONS: Array<{
    amount: number;
    unit: "year" | "month" | "week" | "day" | "hour" | "minute" | "second";
}> = [
    { amount: 60, unit: "second" },
    { amount: 60, unit: "minute" },
    { amount: 24, unit: "hour" },
    { amount: 7, unit: "day" },
    { amount: 4.34524, unit: "week" },
    { amount: 12, unit: "month" },
    { amount: Infinity, unit: "year" },
];

function formatRelative(date: Date) {
    if (!relativeTimeFormatter) return null;
    let duration = (date.getTime() - Date.now()) / 1000;

    for (const division of RELATIVE_TIME_DIVISIONS) {
        if (Math.abs(duration) < division.amount || division.amount === Infinity) {
            return relativeTimeFormatter.format(Math.round(duration), division.unit);
        }
        duration /= division.amount;
    }

    return null;
}

export function getReleaseInfo(dateString?: string | null): ReleaseInfo {
    if (!dateString) return { absolute: null, relative: null };
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
        return { absolute: null, relative: null };
    }

    return {
        absolute: absoluteDateFormatter
            ? absoluteDateFormatter.format(date)
            : date.toDateString(),
        relative: formatRelative(date),
    };
}

function coerceNumber(value: any): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function buildEpisodeKeys(episode: any): string[] {
    if (!episode) return [];
    const season = coerceNumber(episode.season);
    const episodeNumbers = [
        coerceNumber(episode.episode),
        coerceNumber(episode.number),
        coerceNumber(episode.ids?.episode),
    ].filter((value): value is number => value != null);

    const rawKeys = new Set<string>();
    if (typeof episode.id === "string") {
        rawKeys.add(episode.id);
    }

    if (season != null) {
        if (episodeNumbers.length === 0) {
            rawKeys.add(`${season}:0`);
        } else {
            for (const num of episodeNumbers) {
                rawKeys.add(`${season}:${num}`);
                rawKeys.add(`${season}:${num.toString().padStart(2, "0")}`);
            }
        }
    }

    return [...rawKeys];
}

function parseKeySeasonEpisode(key: string) {
    if (typeof key !== "string") return null;
    const normalized = key.replace(/season/gi, "").replace(/episode/gi, "");
    const match = normalized.match(/(\d+)[^\d]+(\d+)/);
    if (match) {
        const season = Number(match[1]);
        const episode = Number(match[2]);
        if (Number.isFinite(season) && Number.isFinite(episode)) {
            return { season, episode };
        }
    }
    const colonMatch = key.split(":");
    if (colonMatch.length === 2) {
        const [s, e] = colonMatch.map((part) => Number(part));
        if (Number.isFinite(s) && Number.isFinite(e)) {
            return { season: s, episode: e };
        }
    }
    return null;
}

function isMovieContext(metaData: any, selectedEpisode: any) {
    if (metaData?.meta?.type) {
        return metaData.meta.type === "movie";
    }
    const seasonValue = coerceNumber(selectedEpisode?.season);
    return seasonValue === 0;
}

function hasResumeProgress(entry: ProgressItem | null) {
    return (
        entry != null &&
        entry.duration != null &&
        entry.duration > 0 &&
        entry.time != null &&
        entry.time > 0 &&
        !entry.watched
    );
}

export function getProgressEntry(
    progressMap: ProgressMap | null,
    streamsPopupVisible: boolean,
    selectedEpisode: any,
    metaData: any,
): ProgressItem | null {
    if (!progressMap) return null;
    if (!streamsPopupVisible && !isMovieContext(metaData, selectedEpisode)) return null;
    if (!selectedEpisode && !isMovieContext(metaData, selectedEpisode)) return null;

    if (isMovieContext(metaData, selectedEpisode)) {
        const entry = progressMap as ProgressItem;
        return hasResumeProgress(entry) ? entry : null;
    }

    const map = progressMap as Record<string, ProgressItem>;
    const keys = buildEpisodeKeys(selectedEpisode);
    for (const key of keys) {
        const entry = map?.[key] ?? null;
        if (hasResumeProgress(entry)) {
            return entry;
        }
    }

    const season = coerceNumber(selectedEpisode?.season);
    const episodeNumbers = [
        coerceNumber(selectedEpisode?.episode),
        coerceNumber(selectedEpisode?.number),
    ].filter((value): value is number => value != null);

    if (season != null && episodeNumbers.length > 0) {
        for (const [key, entry] of Object.entries(map)) {
            const parsed = parseKeySeasonEpisode(key);
            if (
                parsed &&
                parsed.season === season &&
                episodeNumbers.includes(parsed.episode) &&
                hasResumeProgress(entry)
            ) {
                return entry;
            }
        }
    }

    return null;
}

function formatTimeLeft(seconds: number) {
    if (seconds <= 30) return "Finishing up";
    const minutesTotal = Math.floor(seconds / 60);
    const hours = Math.floor(minutesTotal / 60);
    const minutes = minutesTotal % 60;

    if (hours > 0) {
        if (minutes === 0) return `${hours}h left`;
        return `${hours}h ${minutes}m left`;
    }

    if (minutes > 0) return `${minutes}m left`;
    return "Less than a minute left";
}

export function computeProgressDetails(entry: ProgressItem | null): EpisodeProgressDetails | null {
    if (!entry) return null;
    const percent = Math.min(100, Math.max(0, (entry.time / entry.duration) * 100));
    const remaining = Math.max(0, entry.duration - entry.time);
    return {
        percent,
        timeLeftLabel: formatTimeLeft(remaining),
        watched: Boolean(entry.watched),
    };
}
