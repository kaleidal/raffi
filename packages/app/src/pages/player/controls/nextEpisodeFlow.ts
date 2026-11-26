import { get } from "svelte/store";
import * as NavigationLogic from "../../meta/navigationLogic";
import { progressMap } from "../../meta/metaState";
import { createChapterAutomation } from "../chapters/chapterAutomation";
import { errorDetails, errorMessage, loading, showError } from "../playerState";
import { createNextEpisodePrefetchRunner } from "../session/prefetch/nextEpisodePrefetchRunner";
import { createNextEpisodeHandler } from "./playerNextEpisode";

const NEXT_EPISODE_PREFETCH_CLICK_GRACE_MS = 750;

type ChapterOptions = Omit<Parameters<typeof createChapterAutomation>[0], "prefetch" | "playNext">;

/** Moves on to the next episode from a click, the end of an episode or binge chapters, reusing the prefetched stream when it is ready. */
export function createNextEpisodeFlow({
    imdbId,
    getIdleVideo,
    reportProgress,
    getVideoSrc,
    setCurrentVideoSrc,
    chapters,
}: {
    imdbId: string | null;
    getIdleVideo: () => HTMLVideoElement | null;
    reportProgress: (time: number, duration: number) => void;
    getVideoSrc: () => string | null;
    setCurrentVideoSrc: (value: string | null) => void;
    chapters: ChapterOptions;
}) {
    const prefetch = imdbId ? createNextEpisodePrefetchRunner(imdbId, getIdleVideo) : null;

    const playNextEpisode = async () => {
        const resolved = await prefetch?.takeResolved(NEXT_EPISODE_PREFETCH_CLICK_GRACE_MS);
        if (resolved) return NavigationLogic.playResolvedNextEpisode(resolved, get(progressMap));
        if (imdbId) return NavigationLogic.handleNextEpisode(imdbId, get(progressMap));
    };

    const playNext = createNextEpisodeHandler({
        handleProgressInternal: reportProgress,
        getVideoSrc,
        setCurrentVideoSrc,
        invokeNextEpisode: playNextEpisode,
        showActionLoading: (actionLabel, err) => {
            automation.reset();
            loading.set(false);
            showError.set(true);
            errorMessage.set(actionLabel);
            errorDetails.set(err instanceof Error ? err.message : String(err));
        },
        suppressInitialLoading: () => prefetch?.handoff != null,
        onNextEpisodeFailed: () => automation.reset(),
    });

    const automation = createChapterAutomation({ ...chapters, prefetch, playNext });

    return { prefetch, playNext, chapters: automation };
}
