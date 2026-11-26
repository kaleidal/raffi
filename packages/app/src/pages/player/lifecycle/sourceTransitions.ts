import * as Discord from "../integrations/discord";
import type { createEmbedPlayback } from "../integrations/embedPlayback";
import { currentTime, duration, showError } from "../playerState";
import type { createPlayerSessionLoader } from "../session/playerSessionLoader";
import { canReuseNextEpisodePrefetch } from "../session/prefetch/nextEpisodePrefetch";
import type { createNextEpisodePrefetchRunner } from "../session/prefetch/nextEpisodePrefetchRunner";
import * as Session from "../session/videoSession";
import type { PlayerMedia } from "./playerMedia.svelte";

type LoadVideo = ReturnType<typeof createPlayerSessionLoader>["loadVideo"];

/** Moves the player onto a new stream, a prefetched next episode or an embed, or reopens the current stream. */
export function createSourceTransitions({
    media,
    prefetch,
    embedPlayback,
    getStartTime,
    hasStarted,
    loadVideo,
    cancelLoad,
    cancelNextEpisode,
    resetForNewSource,
    resetHealth,
}: {
    media: PlayerMedia;
    prefetch: ReturnType<typeof createNextEpisodePrefetchRunner> | null;
    embedPlayback: Pick<ReturnType<typeof createEmbedPlayback>, "begin" | "cancelLoading">;
    getStartTime: () => number;
    hasStarted: () => boolean;
    loadVideo: LoadVideo;
    cancelLoad: () => void;
    cancelNextEpisode: () => void;
    resetForNewSource: () => void;
    resetHealth: () => void;
}) {
    let currentEmbedSrc: string | null = null;

    function toVideoSource(src: string, fileIdx: number | null) {
        embedPlayback.cancelLoading();
        currentEmbedSrc = null;
        resetForNewSource();
        media.src = src;
        media.fileIdx = fileIdx;
        resetHealth();

        const handoff = prefetch?.handoff ?? null;
        const canReuseHandoff = canReuseNextEpisodePrefetch(handoff, src, fileIdx, getStartTime());
        const previousController = media.controller;
        const previousHls = media.hls;
        // Keep MediaSource on the same element by flipping which surface is visible.
        if (canReuseHandoff) media.swapSurfaces();
        const reuseSession = canReuseHandoff && handoff
            ? {
                  sessionData: handoff.sessionData,
                  mode: handoff.mode,
                  meta: handoff.meta,
                  playbackController: handoff.playbackController,
                  hls: handoff.hls,
              }
            : undefined;

        cancelLoad();
        cancelNextEpisode();
        prefetch?.dispose(reuseSession ? { transfer: true } : undefined);

        if (reuseSession?.playbackController) media.controller = reuseSession.playbackController;
        else if (!canReuseHandoff) media.controller = null;
        if (previousHls && previousHls !== reuseSession?.hls) previousHls.destroy();
        if (reuseSession?.hls) media.hls = reuseSession.hls;
        else if (!canReuseHandoff) media.hls = null;

        const idle = media.idle();
        if (canReuseHandoff && idle && !previousController) {
            idle.pause();
            idle.removeAttribute("src");
            idle.load();
        }

        Session.cleanupSession(null, Discord.clearDiscordActivity, canReuseHandoff ? null : media.video);
        loadVideo(src, reuseSession ? { reuseSession } : undefined);
    }

    function toEmbed(src: string) {
        if (src === currentEmbedSrc) return;
        currentEmbedSrc = src;
        media.src = src;
        media.fileIdx = null;
        resetForNewSource();
        currentTime.set(0);
        duration.set(0);
        cancelLoad();
        prefetch?.dispose();
        cancelNextEpisode();
        Session.cleanupSession(media.hls, Discord.clearDiscordActivity, media.video);
        media.hls = null;
        showError.set(false);
        embedPlayback.begin();
    }

    function reload() {
        if (!media.src) return;
        const video = media.video;
        const resumeAt = hasStarted() && video ? video.currentTime : undefined;
        cancelLoad();
        Session.cleanupSession(media.hls, Discord.clearDiscordActivity, video);
        loadVideo(media.src, { startTime: resumeAt });
    }

    return { toVideoSource, toEmbed, reload };
}
