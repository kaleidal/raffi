import { tick } from "svelte";
import type { ShowResponse } from "../../../lib/library/types/meta_types";
import { isDesktopPlatform } from "../../../lib/shell/platform";
import { isLikelyProviderStatusMedia } from "../../../lib/streams/streamAvailability";
import type { StreamAvailabilityHint } from "../../../lib/streams/types";
import { requestIntroDbChapters, resolvePlaybackStart } from "../chapters/introStartup";
import * as Discord from "../integrations/discord";
import { createEmbedPlayback } from "../integrations/embedPlayback";
import { errorDetails, errorMessage, loading, showCanvas, showError } from "../playerState";
import { createBrowserPlaybackGuard } from "../session/health/browserPlaybackGuard";
import { createPlaybackHealthMonitor } from "../session/health/playbackHealthMonitor";
import { createTorrentFailureExit } from "../session/health/torrentFailure";
import { createPlayerSessionLoader } from "../session/playerSessionLoader";
import { canReuseNextEpisodePrefetch, isSamePlaybackSource } from "../session/prefetch/nextEpisodePrefetch";
import type { createNextEpisodePrefetchRunner } from "../session/prefetch/nextEpisodePrefetchRunner";
import { createSourcePreflight } from "../session/sourcePreflight";
import { createTorrentStatusPoller } from "../session/torrentStatusPolling";
import * as Session from "../session/videoSession";
import * as Subtitles from "../subtitles/subtitles";
import type { Chapter } from "../types";
import type { PlayerMedia } from "./playerMedia.svelte";
import { createSourceTransitions } from "./sourceTransitions";

export type PlayerRoute = {
    videoSrc: string | null;
    embedSrc: string | null;
    fileIdx: number | null;
    metaData: ShowResponse | null;
    startTime: number;
    season: number | null;
    episode: number | null;
    streamAvailability: StreamAvailabilityHint | null;
};

/** Runs the stream pipeline behind the player: preflight checks, loading, source switches, torrents, embeds and playback health. */
export function createPlayerSession({
    media,
    route,
    redirect,
    imdbId,
    prefetch,
    hasStarted,
    setHasStarted,
    setIntroDbChapters,
    getCueLinePercent,
    showArtwork,
    resetForNewSource,
    cancelNextEpisode,
    close,
}: {
    media: PlayerMedia;
    route: () => PlayerRoute;
    redirect: (src: string) => void;
    imdbId: string | null;
    prefetch: ReturnType<typeof createNextEpisodePrefetchRunner> | null;
    hasStarted: () => boolean;
    setHasStarted: (value: boolean) => void;
    setIntroDbChapters: (chapters: Chapter[]) => void;
    getCueLinePercent: () => number;
    showArtwork: () => void;
    resetForNewSource: () => void;
    cancelNextEpisode: () => void;
    close: () => void;
}) {
    const guard = createBrowserPlaybackGuard({
        getVideo: () => media.video,
        getSource: () => media.src || route().videoSrc || "",
        hasEmbed: () => Boolean(route().embedSrc),
        isDesktop: isDesktopPlatform,
        showError: (reason, details) => {
            loading.set(false);
            showCanvas.set(false);
            showError.set(true);
            errorMessage.set("Browser cannot play this stream");
            errorDetails.set(`${reason} ${details}`);
        },
    });

    const embed = createEmbedPlayback({
        isActive: () => Boolean(route().embedSrc),
        getContext: () => {
            const { metaData, season, episode } = route();
            return { imdbId, metaData, season, episode };
        },
        onStarted: () => setHasStarted(true),
    });

    const health = createPlaybackHealthMonitor({
        hasStarted,
        reopenStream: () => {
            if (media.src && media.video) loadVideo(media.src, { startTime: media.video.currentTime });
        },
    });

    const torrentFailure = createTorrentFailureExit({ imdbId, close });
    const torrentPoller = createTorrentStatusPoller({ onTorrentError: torrentFailure.fail });

    const preflight = createSourcePreflight({
        getAvailability: () => route().streamAvailability,
        isPrefetched: (source) =>
            canReuseNextEpisodePrefetch(prefetch?.handoff ?? null, source.src, source.fileIdx, route().startTime),
        isStillRequested: (source) => {
            const { videoSrc, fileIdx } = route();
            return isSamePlaybackSource(videoSrc, fileIdx, source.src, source.fileIdx);
        },
        start: (source) => transitions.toVideoSource(source.src, source.fileIdx),
        redirect,
        onCheckStarted: showArtwork,
    });

    const loader = createPlayerSessionLoader({
        getFileIdx: () => route().fileIdx,
        getStartTime: () => route().startTime,
        getMetaData: () => route().metaData,
        getSeason: () => route().season,
        getEpisode: () => route().episode,
        getVideoElem: () => media.video,
        getHls: () => media.hls,
        setHls: (value) => (media.hls = value),
        getPlaybackController: () => media.controller,
        setPlaybackController: (value) => (media.controller = value),
        getCueLinePercent,
        setHasStarted,
        setIntroDbChapters,
        handleProviderStatusMedia: ({ source, meta }) => {
            const { streamAvailability, videoSrc } = route();
            if (
                !streamAvailability ||
                !isLikelyProviderStatusMedia({
                    expectedSizeBytes: streamAvailability.expectedSizeBytes,
                    durationSeconds: meta.durationSeconds,
                })
            ) {
                return false;
            }
            preflight.block(videoSrc || source);
            showError.set(false);
            return true;
        },
        resolvePlaybackStart: (context) =>
            resolvePlaybackStart(context, (chapters) => {
                const { metaData, season, episode } = route();
                if (metaData === context.metaData && season === context.season && episode === context.episode) {
                    setIntroDbChapters(chapters);
                }
            }),
        startTorrentStatusPolling: torrentPoller.start,
        awaitTorrentReady: torrentPoller.waitUntilReady,
        stopTorrentStatusPolling: torrentPoller.stop,
        awaitDomUpdate: tick,
    });

    const loadVideo: typeof loader.loadVideo = (src, opts) => {
        const { metaData, season, episode } = route();
        void requestIntroDbChapters(metaData, season, episode);
        return loader.loadVideo(src, opts);
    };

    const transitions = createSourceTransitions({
        media,
        prefetch,
        embedPlayback: embed,
        getStartTime: () => route().startTime,
        hasStarted,
        loadVideo,
        cancelLoad: loader.cancelCurrentLoad,
        cancelNextEpisode,
        resetForNewSource,
        resetHealth: health.reset,
    });

    /** Retries a source the preflight held back, or reloads the current one. */
    function retry(fallback: () => void) {
        const { videoSrc, fileIdx } = route();
        if (videoSrc && media.src !== videoSrc && preflight.retry({ src: videoSrc, fileIdx })) return;
        fallback();
    }

    function dispose() {
        preflight.cancel();
        torrentPoller.stop();
        torrentFailure.cancel();
        health.dispose();
        embed.cancelLoading();
        guard.clearAudioCheck();
        loader.cancelCurrentLoad();
        Subtitles.releaseUploadedSubtitleUrls();
        prefetch?.dispose();
        void media.controller?.destroy();
        media.controller = null;
        Session.cleanupSession(media.hls, Discord.clearDiscordActivity, media.video);
    }

    return {
        guard,
        embed,
        health,
        preflight,
        transitions,
        loadVideo,
        retry,
        cancelLoad: loader.cancelCurrentLoad,
        stopTorrentPolling: torrentPoller.stop,
        dispose,
    };
}
