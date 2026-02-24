import { get } from "svelte/store";
import { currentTime, duration, loading } from "./playerState";

export const createNextEpisodeHandler = ({
    trackEvent,
    getPlaybackAnalyticsProps,
    handleProgressInternal,
    getVideoSrc,
    setCurrentVideoSrc,
    invokeNextEpisode,
    showActionLoading,
}: {
    trackEvent: (event: string, props?: Record<string, any>) => void;
    getPlaybackAnalyticsProps: () => Record<string, any>;
    handleProgressInternal: (time: number, duration: number) => void;
    getVideoSrc: () => string | null;
    setCurrentVideoSrc: (value: string | null) => void;
    invokeNextEpisode: () => unknown;
    showActionLoading: (label: string, err: unknown) => void;
}) => {
    let nextEpisodeAttemptId = 0;

    return () => {
        trackEvent("next_episode_clicked", getPlaybackAnalyticsProps());

        nextEpisodeAttemptId += 1;
        const attemptId = nextEpisodeAttemptId;
        setCurrentVideoSrc(getVideoSrc());
        const beforeSrc = getVideoSrc();
        loading.set(true);

        const currentDuration = get(duration);
        const currentPlaybackTime = get(currentTime);
        if (currentDuration > 0 && currentDuration - currentPlaybackTime <= 600) {
            handleProgressInternal(currentDuration, currentDuration);
        }

        try {
            const res = invokeNextEpisode as unknown as () => unknown;
            const result = res?.();
            if (result && typeof (result as any).then === "function") {
                (result as Promise<unknown>).catch((err) => {
                    if (attemptId !== nextEpisodeAttemptId) return;
                    showActionLoading("Next Episode Failed", err);
                });
            }
        } catch (err) {
            if (attemptId !== nextEpisodeAttemptId) return;
            showActionLoading("Next Episode Failed", err);
            return;
        }

        window.setTimeout(() => {
            if (attemptId !== nextEpisodeAttemptId) return;
            if (get(loading) && getVideoSrc() === beforeSrc) {
                showActionLoading(
                    "Next Episode Failed",
                    "No new stream started. Please try again.",
                );
            }
        }, 10000);
    };
};
