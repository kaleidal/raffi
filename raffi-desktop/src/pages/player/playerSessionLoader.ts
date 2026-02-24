import { get } from "svelte/store";
import type { ShowResponse } from "../../lib/library/types/meta_types";
import type { Track } from "./types";
import * as Session from "./videoSession";
import * as Subtitles from "./subtitles";
import * as Discord from "./discord";
import { autoEnableDefaultSubtitles as applyDefaultSubtitles } from "./subtitleAutoSelect";
import {
    isPlaying,
    loading,
    loadingStage,
    loadingDetails,
    loadingProgress,
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
    playbackOffset,
    sessionData,
    pendingSeek,
    seekGuard,
    firstSeekLoad,
    showSeekStyleModal,
    hasStarted as hasStartedStore,
    currentChapter,
} from "./playerState";

export type PlayerSessionLoaderDeps = {
    fileIdx: number | null;
    startTime: number;
    autoPlay: boolean;
    metaData: ShowResponse | null;
    season: number | null;
    episode: number | null;
    getVideoElem: () => HTMLVideoElement | undefined;
    getHls: () => any;
    setHls: (value: any) => void;
    setSessionId: (value: string) => void;
    getCueLinePercent: () => number;
    shouldShowSeekStyleInfoModal: () => boolean;
    setPendingStartAfterSeekStyleModal: (value: boolean) => void;
    setHasStarted: (value: boolean) => void;
    startTorrentStatusPolling: (torrentInfoHash: string) => void;
    stopTorrentStatusPolling: () => void;
    awaitDomUpdate: () => Promise<void>;
};

export function createPlayerSessionLoader(deps: PlayerSessionLoaderDeps) {
    let loadTimeout: ReturnType<typeof setTimeout> | null = null;

    const clearLoadTimeout = () => {
        if (!loadTimeout) return;
        clearTimeout(loadTimeout);
        loadTimeout = null;
    };

    const loadVideo = async (src: string) => {
        try {
            loadingStage.set("Initializing playback");
            loadingDetails.set("");
            loadingProgress.set(null);

            const result = await Session.loadVideoSession(
                src,
                deps.fileIdx,
                deps.startTime,
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
                    setPlaybackOffset: playbackOffset.set,
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
                },
                () =>
                    Subtitles.fetchAddonSubtitles(
                        deps.metaData,
                        deps.season,
                        deps.episode,
                    ).then((tracks) => {
                        subtitleTracks.update((current) => [
                            ...current,
                            ...tracks,
                        ]);
                    }),
            );

            deps.setSessionId(result.sessionId);
            sessionData.set(result.sessionData);

            if (result.sessionData?.isTorrent && result.sessionData?.torrentInfoHash) {
                deps.startTorrentStatusPolling(result.sessionData.torrentInfoHash);
            } else {
                deps.stopTorrentStatusPolling();
            }

            await deps.awaitDomUpdate();
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

            Discord.updateDiscordActivity(
                deps.metaData,
                deps.season,
                deps.episode,
                get(duration),
                0,
                false,
            );

            const needsSeekStyleModal =
                !!deps.autoPlay && deps.shouldShowSeekStyleInfoModal();
            if (needsSeekStyleModal) {
                showSeekStyleModal.set(true);
                deps.setPendingStartAfterSeekStyleModal(true);
            }

            const bypassServer = Session.shouldBypassServerForHttpStream(src, videoElem);

            if (bypassServer) {
                loadingStage.set("Loading stream directly");
                loadingDetails.set("Bypassing server transcoding");
                loadingProgress.set(null);

                const hls = deps.getHls();
                if (hls) {
                    try {
                        hls.destroy();
                    } catch {
                        // ignore
                    }
                    deps.setHls(null);
                }

                playbackOffset.set(0);
                void applyDefaultSubtitles({
                    sessionData: result.sessionData,
                    subtitleTracksValue: get(subtitleTracks),
                    videoElem,
                    currentTime: get(currentTime),
                    playbackOffset: get(playbackOffset),
                    cueLinePercent: deps.getCueLinePercent(),
                    setSubtitleTracks: (updater: (tracks: Track[]) => Track[]) =>
                        subtitleTracks.update(updater),
                    setCurrentSubtitleLabel: currentSubtitleLabel.set,
                    handleSubtitleSelect: Subtitles.handleSubtitleSelect,
                })
                    .catch(() => {
                        // ignore
                    });
                loading.set(true);

                const onLoaded = () => {
                    const currentVideo = deps.getVideoElem();
                    if (!currentVideo) return;

                    if (
                        Number.isFinite(currentVideo.duration) &&
                        currentVideo.duration > 0
                    ) {
                        duration.set(currentVideo.duration);
                    }

                    if (deps.startTime > 0) {
                        try {
                            currentVideo.currentTime = deps.startTime;
                        } catch {
                            // ignore
                        }
                    }

                    loading.set(false);
                    loadingStage.set("");
                    loadingDetails.set("");
                    showCanvas.set(false);

                    if (!needsSeekStyleModal && deps.autoPlay) {
                        currentVideo.play().catch(() => {
                            // ignore
                        });
                    }
                };

                videoElem.addEventListener("loadedmetadata", onLoaded, {
                    once: true,
                });

                videoElem.src = src;
                videoElem.load();
                return;
            }

            void applyDefaultSubtitles({
                sessionData: result.sessionData,
                subtitleTracksValue: get(subtitleTracks),
                videoElem,
                currentTime: get(currentTime),
                playbackOffset: get(playbackOffset),
                cueLinePercent: deps.getCueLinePercent(),
                setSubtitleTracks: (updater: (tracks: Track[]) => Track[]) =>
                    subtitleTracks.update(updater),
                setCurrentSubtitleLabel: currentSubtitleLabel.set,
                handleSubtitleSelect: Subtitles.handleSubtitleSelect,
            })
                .catch(() => {
                    // ignore
                });

            loadingStage.set("Preparing stream");
            loadingDetails.set("Starting HLS session...");
            loadingProgress.set(null);

            const sessionId = result.sessionId;
            const hlsInstance = Session.initHLS(
                videoElem,
                sessionId,
                deps.startTime,
                needsSeekStyleModal ? false : deps.autoPlay,
                Session.createSeekHandler(
                    videoElem,
                    deps.getHls,
                    sessionId,
                    () => get(pendingSeek),
                    () => get(seekGuard),
                    () => get(playbackOffset),
                    () => get(subtitleTracks),
                    () => get(currentSubtitleLabel),
                    (track) =>
                        Subtitles.handleSubtitleSelect(
                            track,
                            videoElem,
                            get(currentTime),
                            get(playbackOffset),
                            deps.getCueLinePercent,
                        ),
                    {
                        setPendingSeek: pendingSeek.set,
                        setSeekGuard: seekGuard.set,
                        setLoading: loading.set,
                        setShowCanvas: showCanvas.set,
                        setFirstSeekLoad: firstSeekLoad.set,
                        setPlaybackOffset: playbackOffset.set,
                    },
                ),
                {
                    setLoading: loading.set,
                    setShowCanvas: showCanvas.set,
                    setPlaybackOffset: playbackOffset.set,
                    setShowError: showError.set,
                    setErrorMessage: errorMessage.set,
                    setErrorDetails: errorDetails.set,
                },
            );
            deps.setHls(hlsInstance);

            clearLoadTimeout();
            loadTimeout = setTimeout(() => {
                if (
                    get(loading) &&
                    !get(hasStartedStore) &&
                    !get(isPlaying)
                ) {
                    loading.set(false);
                    showError.set(true);
                    errorMessage.set("Stream took too long to load");
                    errorDetails.set("Please try another stream.");
                }
            }, 60000);
        } catch (err) {
            console.error(err);
        }
    };

    return {
        clearLoadTimeout,
        loadVideo,
    };
}
