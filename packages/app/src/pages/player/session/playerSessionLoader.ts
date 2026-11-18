import type { ClientPlaybackController } from "../../../lib/media";
import {
    canTryClientPlayback,
    isMagnetUrl,
    toClientPlayableUrl,
} from "../../../lib/media/localSource";
import {
    removeLimboTorrent,
    type LimboTorrentStatus,
} from "../../../lib/streams/limboClient";
import * as Session from "./videoSession";
import * as Subtitles from "../subtitles/subtitles";
import { applyClientAudioTracks, embeddedSubtitleTracks, sessionFromProbe } from "./playerSessionMetadata";
import {
    describePlaybackFailure,
    PlaybackPreparationError,
} from "./health/playbackFailure";
import { attachClientPlayback } from "./loader/clientPlaybackAttach";
import { probeClientPlayback, type ClientPlayback } from "./loader/clientPlaybackProbe";
import { limboPlaybackFailure, resolveLimboStream } from "./loader/limboStream";
import { canResumeSession, resumeReusedSession, type ReusedSession } from "./loader/reusedSession";
import type { PlayerSessionLoaderDeps } from "./loader/sessionLoaderDeps";
import {
    isPlaying,
    loading,
    loadingStage,
    loadingDetails,
    loadingProgress,
    playbackBuffering,
    showCanvas,
    currentTime,
    duration,
    showSkipIntro,
    showNextEpisode,
    currentAudioLabel,
    currentSubtitleLabel,
    showError,
    errorMessage,
    errorDetails,
    audioTracks,
    subtitleTracks,
    sessionData,
    pendingSeek,
    seekGuard,
    firstSeekLoad,
    currentChapter,
} from "../playerState";

export function createPlayerSessionLoader(deps: PlayerSessionLoaderDeps) {
    let loadGeneration = 0;
    let activeAbortController: AbortController | null = null;
    let activeLimboTorrentId = "";
    let cleanupPromise = Promise.resolve();

    const cancelCurrentLoad = (
        preservedController: ClientPlaybackController | null = null,
        preservedHls: any = null,
    ) => {
        loadGeneration += 1;
        activeAbortController?.abort();
        activeAbortController = null;
        deps.stopTorrentStatusPolling();
        const playbackController = deps.getPlaybackController();
        const limboTorrentId = activeLimboTorrentId;
        if (playbackController && playbackController !== preservedController) {
            deps.setPlaybackController(null);
        }
        const hls = deps.getHls();
        if (hls && hls !== preservedHls) {
            try {
                hls.destroy();
            } catch {
            }
            deps.setHls(null);
        }
        activeLimboTorrentId = "";
        if (playbackController && playbackController !== preservedController) {
            void playbackController.destroy().catch((error) => {
                console.warn("Playback cleanup failed", error);
            });
        }
        cleanupPromise = cleanupPromise.then(async () => {
            if (limboTorrentId) {
                await removeLimboTorrent(limboTorrentId, false);
            }
        });
        return cleanupPromise;
    };

    const loadVideo = async (
        src: string,
        opts?: {
            reuseSession?: ReusedSession;
            /** Overrides the requested start, e.g. to resume where a reload left off. */
            startTime?: number;
        },
    ) => {
        const cleanup = cancelCurrentLoad(
            opts?.reuseSession?.playbackController ?? null,
            opts?.reuseSession?.hls ?? null,
        );
        const generation = loadGeneration;
        await cleanup;
        if (generation !== loadGeneration) return;
        Subtitles.releaseUploadedSubtitleUrls();
        const abortController = new AbortController();
        activeAbortController = abortController;
        const isStale = () =>
            generation !== loadGeneration || abortController.signal.aborted;

        try {
            const reused = opts?.reuseSession;
            if (reused && canResumeSession(reused)) {
                await resumeReusedSession({
                    src,
                    reused,
                    startTimeOverride: opts?.startTime,
                    deps,
                    isStale,
                });
                return;
            }

            loadingStage.set("Initializing playback");
            loadingDetails.set("");
            loadingProgress.set(null);

            const fileIdx = deps.getFileIdx();
            const startTime = opts?.startTime ?? deps.getStartTime();
            const metaData = deps.getMetaData();
            const season = deps.getSeason();
            const episode = deps.getEpisode();

            let playbackSrc = src;
            let limboStatus: LimboTorrentStatus | null = null;

            if (isMagnetUrl(src)) {
                const limbo = await resolveLimboStream(
                    src,
                    fileIdx,
                    abortController.signal,
                    {
                        onTorrentAdded: (torrentId) => {
                            activeLimboTorrentId = torrentId;
                        },
                        startTorrentStatusPolling: deps.startTorrentStatusPolling,
                        awaitTorrentReady: deps.awaitTorrentReady,
                    },
                );
                if (isStale()) return;
                playbackSrc = limbo.streamUrl;
                limboStatus = limbo.status;
            }

            const playableSrc = await toClientPlayableUrl(playbackSrc);
            const canTryClient =
                !opts?.reuseSession && canTryClientPlayback(playableSrc);

            let clientPlayback: ClientPlayback | null = null;

            if (canTryClient || limboStatus) {
                clientPlayback = await probeClientPlayback(
                    playableSrc,
                    deps.getVideoElem(),
                    abortController.signal,
                    !!limboStatus,
                );
                if (!clientPlayback) return;
            }

            if (isStale()) return;

            if (
                clientPlayback?.meta &&
                deps.handleProviderStatusMedia?.({
                    source: playbackSrc,
                    meta: clientPlayback.meta,
                })
            ) {
                loading.set(false);
                loadingStage.set("");
                loadingDetails.set("");
                loadingProgress.set(null);
                showCanvas.set(false);
                return;
            }

            const useClientPlayback =
                clientPlayback?.mode === "direct" ||
                clientPlayback?.mode === "mediabunny" ||
                clientPlayback?.mode === "addon-hls";

            if (limboStatus && !useClientPlayback) {
                throw limboPlaybackFailure(clientPlayback);
            }

            if (clientPlayback?.mode === "unsupported") {
                const failure = describePlaybackFailure(clientPlayback);
                throw new PlaybackPreparationError(failure.title, failure.details);
            }

            const sessionSource = useClientPlayback ? playableSrc : playbackSrc;

            const result = await Session.loadVideoSession(
                sessionSource,
                fileIdx,
                startTime,
                {
                    setLoading: loading.set,
                    setLoadingStage: loadingStage.set,
                    setLoadingDetails: loadingDetails.set,
                    setLoadingProgress: loadingProgress.set,
                    setShowCanvas: showCanvas.set,
                    setIsPlaying: isPlaying.set,
                    setHasStarted: deps.setHasStarted,
                    setShowError: showError.set,
                    setErrorMessage: errorMessage.set,
                    setErrorDetails: errorDetails.set,
                    setCurrentTime: currentTime.set,
                    setDuration: duration.set,
                    setCurrentChapter: currentChapter.set,
                    setShowSkipIntro: showSkipIntro.set,
                    setShowNextEpisode: showNextEpisode.set,
                    setSeekGuard: seekGuard.set,
                    setFirstSeekLoad: firstSeekLoad.set,
                    setPendingSeek: pendingSeek.set,
                    setAudioTracks: audioTracks.set,
                    setSubtitleTracks: subtitleTracks.set,
                    setCurrentAudioLabel: currentAudioLabel.set,
                    setCurrentSubtitleLabel: currentSubtitleLabel.set,
                    setSessionData: sessionData.set,
                },
                () =>
                    Subtitles.fetchAddonSubtitles(
                        metaData,
                        season,
                        episode,
                    ).then((tracks) => {
                        subtitleTracks.update((current) => [
                            ...current,
                            ...tracks,
                        ]);
                    }),
                {
                    ...opts,
                    directHttp: useClientPlayback,
                },
            );

            if (isStale()) return;

            if (limboStatus) {
                result.sessionData = {
                    ...result.sessionData,
                    isTorrent: true,
                    torrentInfoHash: limboStatus.infoHash,
                    limboTorrentId: limboStatus.id,
                    sourceUrl: playableSrc,
                };
            } else {
                deps.stopTorrentStatusPolling();
            }

            if (isStale()) return;

            if (useClientPlayback && clientPlayback) {
                result.sessionData = applyClientAudioTracks(
                    clientPlayback.meta,
                    sessionSource,
                    {
                        ...result.sessionData,
                        ...sessionFromProbe(clientPlayback.meta, sessionSource),
                    },
                );
                subtitleTracks.update((tracks) => [
                    ...tracks,
                    ...embeddedSubtitleTracks(clientPlayback.meta, sessionSource),
                ]);
            }

            sessionData.set(result.sessionData);

            const playbackStart = await deps.resolvePlaybackStart({
                sessionData: result.sessionData,
                startTime,
                metaData,
                season,
                episode,
            });
            if (isStale()) return;
            const effectiveStartTime = playbackStart.effectiveStartTime;
            deps.setIntroDbChapters(playbackStart.introDbChapters);

            await deps.awaitDomUpdate();
            if (isStale()) return;
            const videoElem = deps.getVideoElem();
            if (!videoElem) return;

            try {
                const isLocalFile =
                    typeof src === "string" &&
                    !src.startsWith("http://") &&
                    !src.startsWith("https://") &&
                    !src.startsWith("magnet:");
                videoElem.dataset.raffiSource = isLocalFile ? "local" : "remote";
            } catch {
                // ignore
            }

            if (useClientPlayback && clientPlayback) {
                await attachClientPlayback({
                    videoElem,
                    clientPlayback,
                    sessionSource,
                    session: result,
                    effectiveStartTime,
                    autoStart: deps.autoPlay,
                    signal: abortController.signal,
                    isStale,
                    deps,
                });
                return;
            }

            throw new Error(
                "This stream cannot be played without a remux path. Try another source.",
            );
        } catch (err) {
            if (activeLimboTorrentId) {
                void removeLimboTorrent(activeLimboTorrentId, false);
                activeLimboTorrentId = "";
            }
            if (isStale() || (err instanceof DOMException && err.name === "AbortError")) {
                return;
            }
            console.error("Failed to prepare playback", err);
            deps.stopTorrentStatusPolling();
            playbackBuffering.set(false);
            loading.set(false);
            loadingStage.set("");
            loadingDetails.set("");
            loadingProgress.set(null);
            showCanvas.set(false);
            seekGuard.set(false);
            errorMessage.set(
                err instanceof PlaybackPreparationError
                    ? err.userTitle
                    : "Failed to prepare stream",
            );
            errorDetails.set(err instanceof Error ? err.message : String(err));
            showError.set(true);
        } finally {
            if (activeAbortController === abortController) {
                activeAbortController = null;
            }
        }
    };

    return {
        loadVideo,
        cancelCurrentLoad,
    };
}
