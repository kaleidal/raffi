import { get } from "svelte/store";
import type { ShowResponse } from "../../../lib/library/types/meta_types";
import { autoSkipIntros } from "../../../lib/stores/playbackPreferences";
import { currentChapter, duration, sessionData, showNextEpisode, showSkipIntro } from "../playerState";
import type { createNextEpisodePrefetchRunner } from "../session/prefetch/nextEpisodePrefetchRunner";
import type { Chapter } from "../types";
import * as Chapters from "./chapters";

/** Follows chapters during playback: skip prompts, binge skipping, moving on to the next episode and prefetching it. */
export function createChapterAutomation({
    getMetaData,
    getIntroDbChapters,
    prepareSeek,
    isBingeSupported,
    hasNextEpisode,
    getPrefetchWindow,
    prefetch,
    seekTo,
    playNext,
    setSkipLabel,
}: {
    getMetaData: () => ShowResponse | null;
    getIntroDbChapters: () => Chapter[];
    prepareSeek: (time: number) => void;
    isBingeSupported: () => boolean;
    hasNextEpisode: () => boolean;
    getPrefetchWindow: () => { startAt: number; creditsAt: number };
    prefetch: ReturnType<typeof createNextEpisodePrefetchRunner> | null;
    seekTo: (time: number) => void;
    playNext: () => void;
    setSkipLabel: (label: string) => void;
}) {
    let advancing = false;

    const advance = () => {
        advancing = true;
        playNext();
    };

    function follow(time: number) {
        const session = get(sessionData);
        const total = get(duration);
        const introDbChapters = getIntroDbChapters();
        const result = Chapters.checkChapters(time, session, total, getMetaData(), introDbChapters);
        currentChapter.set(result.currentChapter);
        showSkipIntro.set(result.showSkipIntro);
        const skipLanding = Chapters.upcomingSkipLanding(time, session, introDbChapters);
        if (skipLanding != null) prepareSeek(skipLanding);
        showNextEpisode.set(result.showNextEpisode);
        setSkipLabel(result.skipButtonLabel);

        if (isBingeSupported()) {
            const action = Chapters.getBingeAction(time, result.currentChapter, {
                sessionData: session,
                introDbChapters,
                duration: total,
                autoSkipIntros: get(autoSkipIntros),
            });
            if (action?.kind === "skip") return seekTo(action.to);
            if (action?.kind === "next" && !advancing) return advance();
        }

        if (hasNextEpisode()) prefetch?.maybeStart(time, getPrefetchWindow());
    }

    function finish() {
        if (isBingeSupported() && hasNextEpisode() && !advancing) advance();
    }

    function reset() {
        advancing = false;
    }

    return { follow, finish, reset };
}
