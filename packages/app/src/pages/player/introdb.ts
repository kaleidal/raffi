import type { Chapter, ChapterKind } from "./types";

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
const chapterCache = new Map<string, Chapter[]>();

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

export async function fetchIntroDbChapters(
    imdbId: string | null | undefined,
    season: number | null | undefined,
    episode: number | null | undefined,
): Promise<Chapter[]> {
    if (!imdbId || season == null || episode == null) {
        return [];
    }

    const cacheKey = `${imdbId}:${season}:${episode}`;
    const cached = chapterCache.get(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams({
        imdb_id: imdbId,
        season: String(season),
        episode: String(episode),
    });

    let data: IntroDbResponse;
    const electronApi = typeof window !== "undefined" ? window.electronAPI : undefined;

    if (electronApi?.fetchIntroDbSegments) {
        const result = await electronApi.fetchIntroDbSegments(imdbId, season, episode);
        if (result.status === 404) {
            return [];
        }
        data = result.data as IntroDbResponse;
    } else {
        const response = await fetch(`${INTRO_DB_BASE_URL}/segments?${params.toString()}`);
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

    const chapters = [
        toChapter("recap", data.recap),
        toChapter("intro", data.intro),
        toChapter("outro", data.outro),
    ].filter((chapter): chapter is Chapter => Boolean(chapter));
    console.info(
        chapters.length > 0 ? "Loaded IntroDB chapters" : "No IntroDB chapters available",
        { imdbId, season, episode, chapters },
    );
    chapterCache.set(cacheKey, chapters);
    return chapters;
}
