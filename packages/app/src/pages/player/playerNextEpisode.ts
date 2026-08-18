import { get } from "svelte/store";
import { currentTime, duration, loading } from "./playerState";

const NEXT_EPISODE_TIMEOUT_MS = 45_000;

export type NextEpisodeHandler = (() => void) & { cancel: () => void };

export const createNextEpisodeHandler = ({
    handleProgressInternal,
    getVideoSrc,
    setCurrentVideoSrc,
    invokeNextEpisode,
    showActionLoading,
    suppressInitialLoading,
    onNextEpisodeFailed,
}: {
    handleProgressInternal: (time: number, duration: number) => void;
    getVideoSrc: () => string | null;
    setCurrentVideoSrc: (value: string | null) => void;
    invokeNextEpisode: () => unknown;
    showActionLoading: (label: string, err: unknown) => void;
    suppressInitialLoading?: () => boolean;
    onNextEpisodeFailed?: () => void;
}): NextEpisodeHandler => {
    let nextEpisodeAttemptId = 0;
    let activeTimeout: ReturnType<typeof setTimeout> | null = null;

    const clearActiveTimeout = () => {
        if (activeTimeout != null) {
            clearTimeout(activeTimeout);
            activeTimeout = null;
        }
    };

    const fail = (attemptId: number, err: unknown) => {
        if (attemptId !== nextEpisodeAttemptId) return;
        clearActiveTimeout();
        onNextEpisodeFailed?.();
        showActionLoading("Next Episode Failed", err);
    };

    const handler = (() => {

        nextEpisodeAttemptId += 1;
        const attemptId = nextEpisodeAttemptId;
        clearActiveTimeout();
        setCurrentVideoSrc(getVideoSrc());
        if (!suppressInitialLoading?.()) {
            loading.set(true);
        }

        const currentDuration = get(duration);
        const currentPlaybackTime = get(currentTime);
        if (currentDuration > 0 && currentDuration - currentPlaybackTime <= 600) {
            handleProgressInternal(currentDuration, currentDuration);
        }

        activeTimeout = setTimeout(() => {
            fail(attemptId, new Error("Timed out loading the next episode"));
        }, NEXT_EPISODE_TIMEOUT_MS);

        try {
            const res = invokeNextEpisode as unknown as () => unknown;
            const result = res?.();
            if (result && typeof (result as any).then === "function") {
                (result as Promise<unknown>).catch((err) => {
                    fail(attemptId, err);
                });
            }
        } catch (err) {
            fail(attemptId, err);
        }
    }) as NextEpisodeHandler;

    handler.cancel = () => {
        nextEpisodeAttemptId += 1;
        clearActiveTimeout();
    };

    return handler;
};
