// Chapter detection and skip logic
import type { Chapter, SessionData } from "./types";
import type { ShowResponse } from "../../lib/library/types/meta_types";

export function checkChapters(
    time: number,
    sessionData: any,
    duration: number,
    metaData: ShowResponse | null
): {
    currentChapter: Chapter | null;
    showSkipIntro: boolean;
    showNextEpisode: boolean;
} {
    let currentChapter: Chapter | null = null;
    let inIntro = false;
    let inCredits = false;

    if (sessionData && sessionData.chapters) {
        const chapter = sessionData.chapters.find(
            (c: any) => time >= c.startTime && time < c.endTime,
        );

        if (chapter) {
            currentChapter = chapter;
            const title = chapter.title.toLowerCase();

            if (
                title.includes("intro") ||
                title.includes("opening") ||
                title.includes("logo")
            ) {
                inIntro = true;
            }

            if (title.includes("credits") || title.includes("ending")) {
                inCredits = true;
            }
        }
    }

    const showSkipIntro = inIntro;

    let showNextEpisode = false;
    if (inCredits && metaData?.meta.type === "series") {
        showNextEpisode = true;
    } else if (
        duration > 0 &&
        duration - time <= 45 &&
        metaData?.meta.type === "series"
    ) {
        showNextEpisode = true;
    }

    return { currentChapter, showSkipIntro, showNextEpisode };
}

export function skipChapter(currentChapter: Chapter | null, performSeek: (time: number) => void) {
    if (currentChapter) {
        performSeek(currentChapter.endTime + 0.1);
    }
}
