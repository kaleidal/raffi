import { get } from "svelte/store";
import type { ShowResponse } from "../../../lib/library/types/meta_types";
import type { createChapterAutomation } from "../chapters/chapterAutomation";
import * as Discord from "../integrations/discord";
import type { createPlaybackReporting } from "../integrations/playbackReporting";
import { TRAKT_COMPLETION_THRESHOLD } from "../integrations/traktScrobbleManager";
import {
    currentTime,
    duration,
    errorDetails,
    errorMessage,
    isPlaying,
    loading,
    loadingDetails,
    loadingProgress,
    loadingStage,
    pendingSeek,
    playbackBuffering,
    seekGuard,
    showError,
} from "../playerState";
import type { createBrowserPlaybackGuard } from "../session/health/browserPlaybackGuard";
import type { createPlaybackHealthMonitor } from "../session/health/playbackHealthMonitor";

const METADATA_CHECK_MS = 1000;

type MediaContext = { metaData: ShowResponse | null; season: number | null; episode: number | null };

/** Follows the visible video element: playback state, buffering, progress, chapters and streams that lose their metadata. */
export function createPlaybackEvents({
    getVideo,
    isTearingDown,
    getMediaContext,
    hasStarted,
    onStarted,
    reporting,
    chapters,
    stopTorrentPolling,
    health,
    guard,
    captureLoadingBackdrop,
    reload,
}: {
    getVideo: () => HTMLVideoElement | undefined;
    isTearingDown: () => boolean;
    getMediaContext: () => MediaContext;
    hasStarted: () => boolean;
    onStarted: (video: HTMLVideoElement) => void;
    reporting: ReturnType<typeof createPlaybackReporting>;
    chapters: ReturnType<typeof createChapterAutomation>;
    stopTorrentPolling: () => void;
    health: ReturnType<typeof createPlaybackHealthMonitor>;
    guard: ReturnType<typeof createBrowserPlaybackGuard>;
    captureLoadingBackdrop: () => void;
    reload: () => void;
}) {
    const { trakt } = reporting;
    let metadataWatch: ReturnType<typeof setInterval> | undefined;
    let reprobeAttempted = false;

    const updateDiscord = (playing: boolean) => {
        const { metaData, season, episode } = getMediaContext();
        Discord.updateDiscordActivity(metaData, season, episode, get(duration), get(currentTime), playing);
    };

    const nearlyFinished = (time: number) => {
        const total = get(duration);
        return total > 0 && time / total >= TRAKT_COMPLETION_THRESHOLD;
    };

    function timeUpdate() {
        const video = getVideo();
        if (!video || isTearingDown() || get(pendingSeek) != null || get(seekGuard)) return;
        const time = video.currentTime;
        currentTime.set(time);
        reporting.reportProgress(time, get(duration));
        if (!trakt.isStopSent() && nearlyFinished(time)) void trakt.send("stop", true);
        chapters.follow(time);
    }

    function play() {
        stopTorrentPolling();
        isPlaying.set(true);
    }

    function playing() {
        play();
        const video = getVideo()!;
        onStarted(video);
        reporting.clearWatchedProgress(video);
        void trakt.send("start");
        updateDiscord(true);
        playbackBuffering.set(false);
        loading.set(false);
        loadingStage.set("");
        loadingDetails.set("");
        loadingProgress.set(null);
        health.bufferEnd();
        guard.scheduleAudioCheck();
    }

    function pause() {
        // Hard seeks pause the element on purpose while remux/HLS rebuilds — not a user pause.
        if (get(seekGuard) || get(pendingSeek) != null) return;
        if (!hasStarted()) {
            Discord.clearDiscordActivity();
            return;
        }
        isPlaying.set(false);
        if (!trakt.isStopSent() && !nearlyFinished(get(currentTime))) void trakt.send("pause");
        updateDiscord(false);
    }

    function waiting() {
        if (hasStarted()) {
            playbackBuffering.set(true);
        } else {
            captureLoadingBackdrop();
            loading.set(true);
            loadingStage.set("Buffering");
        }
        health.bufferStart();
    }

    function canPlay() {
        playbackBuffering.set(false);
        loading.set(false);
        health.bufferEnd();
    }

    function ended() {
        reporting.stopTrakt();
        chapters.finish();
    }

    function checkMetadata() {
        const video = getVideo();
        if (!video) return;
        const time = video.currentTime;
        if (time <= 2 || video.paused || !(isNaN(video.duration) || video.duration === 0)) return;
        if (!reprobeAttempted) {
            reprobeAttempted = true;
            reload();
        } else if (time > 10) {
            showError.set(true);
            errorMessage.set("Stream Error");
            errorDetails.set("Metadata missing. Please select another stream.");
            video.pause();
            clearInterval(metadataWatch);
        }
    }

    function watchMetadata() {
        metadataWatch = setInterval(checkMetadata, METADATA_CHECK_MS);
        return () => clearInterval(metadataWatch);
    }

    return { timeUpdate, play, playing, pause, waiting, canPlay, ended, watchMetadata };
}
