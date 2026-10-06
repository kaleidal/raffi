import type { Chapter, ChapterKind } from "../types";

type IntroDbSegment = {
    start_sec?: number | string;
    end_sec?: number | string;
    start_ms?: number;
    end_ms?: number;
    confidence?: number;
    submission_count?: number;
};

type IntroDbResponse = {
    imdb_id: string;
    season: number;
    episode: number;
    intro: IntroDbSegment | null;
    recap: IntroDbSegment | null;
    outro: IntroDbSegment | null;
};

const INTRO_DB_BASE_URL = "https://api.introdb.app";
const CHAPTER_CACHE_MAX_ENTRIES = 100;
const REQUEST_TIMEOUT_MS = 8_000;
const chapterRequests = new Map<string, Promise<Chapter[]>>();

const parseTimestamp = (seconds: unknown, milliseconds: unknown): number => {
    if (typeof seconds === "string" && seconds.includes(":")) {
        const parts = seconds.split(":").map(Number);
        if (parts.every(Number.isFinite)) {
            return parts.reduce((total, part) => total * 60 + part, 0);
        }
    }
    const secondsValue = Number(seconds);
    if (Number.isFinite(secondsValue)) return secondsValue;
    const millisecondsValue = Number(milliseconds);
    return Number.isFinite(millisecondsValue) ? millisecondsValue / 1000 : Number.NaN;
};

const toChapter = (kind: ChapterKind, segment: IntroDbSegment | null): Chapter | null => {
    if (!segment) return null;

    const startTime = parseTimestamp(segment.start_sec, segment.start_ms);
    const endTime = parseTimestamp(segment.end_sec, segment.end_ms);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
        return null;
    }

    const title = kind === "recap" ? "Recap" : kind === "outro" ? "Outro" : "Intro";
    return {
        startTime,
        endTime,
        title,
        kind,
        source: "introdb",
        confidence: Number.isFinite(segment.confidence) ? segment.confidence : null,
        submissionCount: Number.isFinite(segment.submission_count)
            ? segment.submission_count
            : null,
    };
};

async function requestIntroDbChapters(
    imdbId: string,
    season: number,
    episode: number,
): Promise<Chapter[]> {
    let data: IntroDbResponse;
    const electronApi = typeof window !== "undefined" ? window.electronAPI : undefined;

    if (electronApi?.fetchIntroDbSegments) {
        const result = await electronApi.fetchIntroDbSegments(imdbId, season, episode);
        if (result.status === 404) {
            return [];
        }
        data = result.data as IntroDbResponse;
    } else {
        const params = new URLSearchParams({
            imdb_id: imdbId,
            season: String(season),
            episode: String(episode),
        });
        const response = await fetch(`${INTRO_DB_BASE_URL}/segments?${params.toString()}`, {
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (response.status === 404) {
            return [];
        }
        if (!response.ok) {
            throw new Error(`IntroDB request failed with ${response.status}`);
        }
        data = (await response.json()) as IntroDbResponse;
    }

    if (!data || typeof data !== "object") {
        return [];
    }

    return [
        toChapter("recap", data.recap),
        toChapter("intro", data.intro),
        toChapter("outro", data.outro),
    ].filter((chapter): chapter is Chapter => Boolean(chapter));
}

/** Shares one request per episode, so prefetching early and reading later costs nothing. */
export function fetchIntroDbChapters(
    imdbId: string | null | undefined,
    season: number | null | undefined,
    episode: number | null | undefined,
): Promise<Chapter[]> {
    if (!imdbId || season == null || episode == null) {
        return Promise.resolve([]);
    }

    const cacheKey = `${imdbId}:${season}:${episode}`;
    const cached = chapterRequests.get(cacheKey);
    if (cached) {
        chapterRequests.delete(cacheKey);
        chapterRequests.set(cacheKey, cached);
        return cached;
    }

    const request = requestIntroDbChapters(imdbId, season, episode).catch((error) => {
        chapterRequests.delete(cacheKey);
        throw error;
    });
    chapterRequests.set(cacheKey, request);
    while (chapterRequests.size > CHAPTER_CACHE_MAX_ENTRIES) {
        const oldestKey = chapterRequests.keys().next().value;
        if (oldestKey === undefined) break;
        chapterRequests.delete(oldestKey);
    }
    return request;
}
