import { get } from "svelte/store";
import type { ShowResponse } from "../../../lib/library/types/meta_types";
import * as ProgressLogic from "../../meta/progressLogic";
import { currentTime, duration, loading, loadingDetails, loadingProgress, loadingStage } from "../playerState";
import * as Discord from "./discord";
import { readEmbedProgress } from "./embedProgress";

const LOAD_FALLBACK_MS = 1200;
const PROGRESS_INTERVAL_MS = 1000;

type EmbedContext = {
    imdbId: string | null;
    metaData: ShowResponse | null;
    season: number | null;
    episode: number | null;
};

/** Tracks progress reported by provider web players, which play inside an iframe Raffi can't control. */
export function createEmbedPlayback({
    isActive,
    getContext,
    onStarted,
}: {
    isActive: () => boolean;
    getContext: () => EmbedContext;
    onStarted: () => void;
}) {
    let lastProgressAt = 0;
    let loadFallback: ReturnType<typeof setTimeout> | null = null;

    function clearLoadFallback() {
        if (loadFallback) clearTimeout(loadFallback);
        loadFallback = null;
    }

    function finishLoading() {
        clearLoadFallback();
        loading.set(false);
        loadingStage.set("");
        loadingDetails.set("");
        loadingProgress.set(null);
    }

    function begin() {
        lastProgressAt = 0;
        loading.set(true);
        loadingStage.set("Loading embedded player");
        loadingDetails.set("");
        loadingProgress.set(null);
        clearLoadFallback();
        loadFallback = setTimeout(finishLoading, LOAD_FALLBACK_MS);
    }

    function loaded() {
        finishLoading();
        const { metaData, season, episode } = getContext();
        Discord.updateDiscordActivity(metaData, season, episode, 0, 0, true);
    }

    function handleMessage(event: MessageEvent) {
        const { imdbId, metaData, season, episode } = getContext();
        if (!isActive() || !imdbId || !metaData) return;
        const progress = readEmbedProgress(event.data);
        if (!progress) return;

        const now = Date.now();
        if (now - lastProgressAt < PROGRESS_INTERVAL_MS) return;
        lastProgressAt = now;

        const total = progress.duration && progress.duration > 0 ? progress.duration : get(duration);
        onStarted();
        currentTime.set(progress.time);
        if (total > 0) {
            duration.set(total);
            void ProgressLogic.handleProgress(progress.time, total, imdbId, true);
        }
        Discord.updateDiscordActivity(metaData, season, episode, total, progress.time, true);
    }

    return { begin, loaded, handleMessage, cancelLoading: clearLoadFallback };
}
