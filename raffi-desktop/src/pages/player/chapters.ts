// Chapter detection and skip logic
import type { Chapter, ChapterKind, SessionData } from "./types";
import type { ShowResponse } from "../../lib/library/types/meta_types";

const OUTRO_FALLBACK_SECONDS = 45;
export const CREDITS_FALLBACK_SECONDS = 60;
export const NEXT_EPISODE_PREBUFFER_LEAD_SECONDS = 120;
export const BINGE_CREDITS_BUFFER_SECONDS = 5;
const CHAINED_SKIP_TOLERANCE_SECONDS = 1.5;

const classifyChapterKind = (title: string): ChapterKind => {
    const normalized = title.toLowerCase();

    if (
        normalized.includes("recap") ||
        normalized.includes("previously") ||
        normalized.includes("last time")
    ) {
        return "recap";
    }

    if (
        normalized.includes("intro") ||
        normalized.includes("opening") ||
        normalized.includes("logo") ||
        normalized.includes("theme")
    ) {
        return "intro";
    }

    if (
        normalized.includes("credits") ||
        normalized.includes("ending") ||
        normalized.includes("outro") ||
        normalized.includes("preview") ||
        normalized.includes("next episode")
    ) {
        return "outro";
    }

    return "chapter";
};

const toNativeChapter = (chapter: any): Chapter | null => {
    const startTime = Number(chapter?.startTime);
    const endTime = Number(chapter?.endTime);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
        return null;
    }

    const title = typeof chapter?.title === "string" && chapter.title.trim().length > 0
        ? chapter.title.trim()
        : "Chapter";
    return {
        startTime,
        endTime,
        title,
        kind: classifyChapterKind(title),
        source: "native",
    };
};

const getNativeChapters = (sessionData: SessionData | null | undefined) => {
    if (!sessionData?.chapters) return [];
    return sessionData.chapters
        .map((chapter) => toNativeChapter(chapter))
        .filter((chapter): chapter is Chapter => Boolean(chapter));
};

const getRelevantNativeChapters = (sessionData: SessionData | null | undefined) =>
    getNativeChapters(sessionData).filter((chapter) => chapter.kind !== "chapter");

const findChapterAtTime = (chapters: Chapter[], time: number) =>
    chapters.find((chapter) => time >= chapter.startTime && time < chapter.endTime) ?? null;

const isSkippableChapter = (chapter: Chapter | null, allowRecap: boolean) => {
    if (!chapter) return false;
    if (chapter.kind === "intro") return true;
    if (allowRecap && chapter.kind === "recap") return true;
    return false;
};

export function getEffectiveChapterSegments(
    sessionData: SessionData | null | undefined,
    introDbChapters: Chapter[] = [],
): Chapter[] {
    const chapterByKind = new Map<ChapterKind, Chapter>();

    for (const chapter of getRelevantNativeChapters(sessionData)) {
        if (!chapter.kind || chapter.kind === "chapter" || chapterByKind.has(chapter.kind)) {
            continue;
        }
        chapterByKind.set(chapter.kind, chapter);
    }

    for (const chapter of introDbChapters) {
        if (!chapter.kind || chapter.kind === "chapter" || chapterByKind.has(chapter.kind)) {
            continue;
        }
        chapterByKind.set(chapter.kind, chapter);
    }

    return Array.from(chapterByKind.values()).sort((left, right) => left.startTime - right.startTime);
}

export function getSkipButtonLabel(currentChapter: Chapter | null) {
    if (currentChapter?.kind === "recap") {
        return "Skip Recap";
    }
    return "Skip Intro";
}

export function getStartupSkipTarget(
    requestedStartTime: number,
    chapters: Chapter[],
    options: {
        autoSkipIntros: boolean;
        autoSkipRecap: boolean;
    },
) {
    let targetTime = Math.max(0, requestedStartTime);

    for (let attempt = 0; attempt < 4; attempt += 1) {
        const currentChapter = findChapterAtTime(chapters, targetTime);
        if (!isSkippableChapter(currentChapter, options.autoSkipRecap)) {
            break;
        }

        targetTime = currentChapter.endTime + 0.1;

        const nextChapter = chapters.find((chapter) => {
            if (!isSkippableChapter(chapter, options.autoSkipRecap)) {
                return false;
            }
            return chapter.startTime <= targetTime + CHAINED_SKIP_TOLERANCE_SECONDS && chapter.startTime >= targetTime - 0.1;
        });

        if (!nextChapter) {
            continue;
        }

        if (nextChapter.kind === "intro" && options.autoSkipIntros) {
            targetTime = nextChapter.endTime + 0.1;
            continue;
        }

        if (nextChapter.kind === "recap" && options.autoSkipRecap) {
            targetTime = nextChapter.endTime + 0.1;
            continue;
        }

        break;
    }

    const currentChapter = findChapterAtTime(chapters, requestedStartTime);
    if (currentChapter?.kind === "intro" && options.autoSkipIntros) {
        return Math.max(targetTime, currentChapter.endTime + 0.1);
    }

    return targetTime;
}

export function getCreditsStartTime(
    duration: number,
    sessionData: SessionData | null,
    introDbChapters: Chapter[] = [],
): number {
    if (!(duration > 0)) return 0;
    const segments = getEffectiveChapterSegments(sessionData, introDbChapters);
    const outro = segments.find((c) => c.kind === "outro") ?? null;
    if (outro) {
        return Math.max(0, Math.min(duration, outro.startTime));
    }
    return Math.max(0, duration - CREDITS_FALLBACK_SECONDS);
}

export function getNextEpisodePrefetchWindow(
    duration: number,
    sessionData: SessionData | null,
    introDbChapters: Chapter[] = [],
): { startAt: number; creditsAt: number } {
    const rawCreditsAt = getCreditsStartTime(duration, sessionData, introDbChapters);
    const creditsAt = Math.max(0, rawCreditsAt - BINGE_CREDITS_BUFFER_SECONDS);
    if (!(duration > 0) || !(creditsAt > 0)) {
        return { startAt: 0, creditsAt: Math.max(0, creditsAt) };
    }
    const rawStart = creditsAt - NEXT_EPISODE_PREBUFFER_LEAD_SECONDS;
    const minEarly = duration * 0.12;
    let startAt = Math.max(0, Math.max(rawStart, minEarly));
    const gap = Math.max(15, Math.min(90, NEXT_EPISODE_PREBUFFER_LEAD_SECONDS * 0.5));
    if (startAt >= creditsAt - gap) {
        startAt = Math.max(0, creditsAt - gap);
    }
    if (startAt >= creditsAt) {
        startAt = Math.max(0, creditsAt - 1);
    }
    return { startAt, creditsAt };
}

export function getBingeOutroAutoNextThreshold(chapter: Chapter | null): number | null {
    if (!chapter || chapter.kind !== "outro") return null;
    const margin = BINGE_CREDITS_BUFFER_SECONDS;
    const start = chapter.startTime;
    const end = chapter.endTime;
    if (!Number.isFinite(end) || end <= start) {
        return start + margin;
    }
    return Math.min(start + margin, Math.max(start, end - 0.25));
}

export function hasMarkedOutroChapter(
    sessionData: SessionData | null,
    introDbChapters: Chapter[] = [],
): boolean {
    return getEffectiveChapterSegments(sessionData, introDbChapters).some((c) => c.kind === "outro");
}

export function checkChapters(
    time: number,
    sessionData: SessionData | null,
    duration: number,
    metaData: ShowResponse | null,
    introDbChapters: Chapter[] = [],
): {
    currentChapter: Chapter | null;
    showSkipIntro: boolean;
    showNextEpisode: boolean;
    skipButtonLabel: string;
} {
    const nativeChapter = findChapterAtTime(getRelevantNativeChapters(sessionData), time);
    const currentChapter = nativeChapter ?? findChapterAtTime(getEffectiveChapterSegments(sessionData, introDbChapters), time);

    const inSkippableIntro = currentChapter?.kind === "intro" || currentChapter?.kind === "recap";
    const showSkipIntro = inSkippableIntro;
    const skipButtonLabel = getSkipButtonLabel(currentChapter);

    let showNextEpisode = false;
    if (currentChapter?.kind === "outro" && metaData?.meta.type === "series") {
        showNextEpisode = true;
    } else if (
        duration > 0 &&
        duration - time <= OUTRO_FALLBACK_SECONDS &&
        metaData?.meta.type === "series"
    ) {
        showNextEpisode = true;
    }

    return { currentChapter, showSkipIntro, showNextEpisode, skipButtonLabel };
}

export function skipChapter(currentChapter: Chapter | null, performSeek: (time: number) => void) {
    if (currentChapter) {
        performSeek(currentChapter.endTime + 0.1);
    }
}
