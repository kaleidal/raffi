// Chapter detection and skip logic
import type { Chapter, ChapterKind, SessionData } from "./types";
import type { ShowResponse } from "../../lib/library/types/meta_types";

const OUTRO_FALLBACK_SECONDS = 45;
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

    const showSkipIntro = currentChapter?.kind === "intro" || currentChapter?.kind === "recap";
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
