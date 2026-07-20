import { get } from "svelte/store";
import type { ShowResponse } from "../../lib/library/types/meta_types";
import { serverUrl } from "../../lib/client";
import type { Chapter, Track } from "./types";
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
    playbackOffset,
    sessionData,
    pendingSeek,
    seekGuard,
    firstSeekLoad,
    showSeekStyleModal,
    currentChapter,
} from "./playerState";

export type PlayerSessionLoaderDeps = {
    getFileIdx: () => number | null;
    getStartTime: () => number;
    autoPlay: boolean;
    getMetaData: () => ShowResponse | null;
    getSeason: () => number | null;
    getEpisode: () => number | null;
    getVideoElem: () => HTMLVideoElement | undefined;
    getHls: () => any;
    setHls: (value: any) => void;
    setSessionId: (value: string) => void;
    getSessionId: () => string;
    getCueLinePercent: () => number;
    shouldShowSeekStyleInfoModal: () => boolean;
    setPendingStartAfterSeekStyleModal: (value: boolean) => void;
    setHasStarted: (value: boolean) => void;
    setIntroDbChapters: (chapters: Chapter[]) => void;
    resolvePlaybackStart: (context: {
        sessionData: any;
        startTime: number;
        metaData: ShowResponse | null;
        season: number | null;
        episode: number | null;
    }) => Promise<{
        effectiveStartTime: number;
        introDbChapters: Chapter[];
    }>;
    startTorrentStatusPolling: (torrentInfoHash: string) => void;
    awaitTorrentReady: (torrentInfoHash: string) => Promise<void>;
    stopTorrentStatusPolling: () => void;
    awaitDomUpdate: () => Promise<void>;
};

export function createPlayerSessionLoader(deps: PlayerSessionLoaderDeps) {
    let loadGeneration = 0;
    let activeAbortController: AbortController | null = null;
    let activeSessionId = "";

    const cancelCurrentLoad = () => {
        loadGeneration += 1;
        activeAbortController?.abort();
        activeAbortController = null;
        deps.stopTorrentStatusPolling();
        if (activeSessionId) {
            Session.cleanupServerSession(activeSessionId);
            activeSessionId = "";
        }
    };

    const loadVideo = async (
        src: string,
        opts?: { reuseSession?: { sessionId: string; sessionData: any } },
    ) => {
        cancelCurrentLoad();
        const generation = loadGeneration;
        const abortController = new AbortController();
        activeAbortController = abortController;
        const isStale = () =>
            generation !== loadGeneration || abortController.signal.aborted;

        try {
            loadingStage.set("Initializing playback");
            loadingDetails.set("");
            loadingProgress.set(null);

            const fileIdx = deps.getFileIdx();
            const startTime = deps.getStartTime();
            const metaData = deps.getMetaData();
            const season = deps.getSeason();
            const episode = deps.getEpisode();
            const directHttp = !opts?.reuseSession && Session.shouldBypassServerForHttpStream(
                src,
                deps.getVideoElem(),
            );

            const result = await Session.loadVideoSession(
                src,
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
                    directHttp,
                },
            );

            if (isStale()) {
                Session.cleanupServerSession(result.sessionId);
                return;
            }

            activeSessionId = result.sessionId;
            deps.setSessionId(result.sessionId);

            if (result.sessionData?.isTorrent && result.sessionData?.torrentInfoHash) {
                const torrentInfoHash = result.sessionData.torrentInfoHash;
                deps.startTorrentStatusPolling(torrentInfoHash);
                await deps.awaitTorrentReady(torrentInfoHash);

                const readySession = await fetch(`${serverUrl}/sessions/${result.sessionId}`);
                if (!readySession.ok) {
                    throw new Error("Failed to refresh ready torrent session info");
                }
                result.sessionData = await readySession.json();
            } else {
                deps.stopTorrentStatusPolling();
            }

            if (isStale()) return;

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
            if (!videoElem) {
                if (activeSessionId) {
                    Session.cleanupServerSession(activeSessionId);
                    activeSessionId = "";
                }
                return;
            }

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
                metaData,
                season,
                episode,
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

                    if (effectiveStartTime > 0) {
                        try {
                            currentVideo.currentTime = effectiveStartTime;
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
                activeSessionId = "";
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

            if (opts?.reuseSession) {
                loadingStage.set("");
                loadingDetails.set("");
            } else {
                loadingStage.set("Preparing stream");
                loadingDetails.set("Starting HLS session...");
            }
            loadingProgress.set(null);

            const sessionId = result.sessionId;
            const initialSeekTime = effectiveStartTime !== startTime ? effectiveStartTime : null;
            loadingDetails.set("Waiting for the first playable segment...");
            const preparedManifestUrl = await Session.prepareHLSManifest(
                sessionId,
                initialSeekTime,
                abortController.signal,
            );
            if (isStale()) return;

            const hlsInstance = Session.initHLS(
                videoElem,
                sessionId,
                effectiveStartTime,
                needsSeekStyleModal ? false : deps.autoPlay,
                Session.createSeekHandler(
                    videoElem,
                    deps.getHls,
                    deps.getSessionId,
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
                        setBuffering: playbackBuffering.set,
                        setShowCanvas: showCanvas.set,
                        setFirstSeekLoad: firstSeekLoad.set,
                        setPlaybackOffset: playbackOffset.set,
                        setShowError: showError.set,
                        setErrorMessage: errorMessage.set,
                        setErrorDetails: errorDetails.set,
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
                initialSeekTime,
                "playback",
                preparedManifestUrl,
            );
            deps.setHls(hlsInstance);
            activeSessionId = "";

        } catch (err) {
            if (isStale() || (err instanceof DOMException && err.name === "AbortError")) {
                return;
            }
            console.error("Failed to prepare playback", err);
            if (activeSessionId) {
                Session.cleanupServerSession(activeSessionId);
                activeSessionId = "";
            }
            deps.stopTorrentStatusPolling();
            playbackBuffering.set(false);
            loading.set(false);
            loadingStage.set("");
            loadingDetails.set("");
            loadingProgress.set(null);
            showCanvas.set(false);
            seekGuard.set(false);
            errorMessage.set("Failed to prepare stream");
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
