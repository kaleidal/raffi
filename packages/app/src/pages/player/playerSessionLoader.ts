import { get } from "svelte/store";
import type { ShowResponse } from "../../lib/library/types/meta_types";
import { decoderFetch, serverUrl } from "../../lib/client";
import {
    MediaBunnyPlayback,
    enrichProbedStreamAudio,
    formatAudioTrackLabel,
    resolveHttpPlayback,
    type ProbedStream,
} from "../../lib/media";
import { isDesktopPlatform } from "../../lib/platform";
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
    getMediaBunny: () => MediaBunnyPlayback | null;
    setMediaBunny: (value: MediaBunnyPlayback | null) => void;
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

function sessionFromProbe(meta: ProbedStream | null, src: string) {
    const availableStreams =
        meta?.audioTracks.map((track) => ({
            type: "audio",
            index: track.index,
            title: formatAudioTrackLabel(track),
            language: track.language || undefined,
            codec: track.codecName || track.codec || undefined,
            playable: track.playable,
        })) ?? [];

    return {
        isDirectHttp: true,
        sourceUrl: src,
        durationSeconds: meta?.durationSeconds ?? 0,
        availableStreams,
        audioIndex: meta?.preferredAudioIndex ?? 0,
        clientPlayback: true,
    };
}

function applyClientAudioTracks(
    meta: ProbedStream | null,
    src: string,
    data: any,
    selectedIndex?: number,
) {
    const probed = sessionFromProbe(meta, src);
    const streams = probed.availableStreams;
    const audioIndex =
        selectedIndex ??
        data?.audioIndex ??
        probed.audioIndex ??
        0;

    const nextAudioTracks: Track[] = streams.map((stream) => ({
        id: stream.index,
        label: stream.title || stream.language || `Audio ${stream.index}`,
        selected: stream.index === audioIndex,
        group: "Embedded",
    }));

    if (nextAudioTracks.length === 0) return data;

    audioTracks.set(nextAudioTracks);
    const selected = nextAudioTracks.find((track) => track.selected);
    if (selected) currentAudioLabel.set(selected.label);

    return {
        ...data,
        ...probed,
        audioIndex,
        availableStreams: streams,
    };
}

export function createPlayerSessionLoader(deps: PlayerSessionLoaderDeps) {
    let loadGeneration = 0;
    let activeAbortController: AbortController | null = null;
    let activeSessionId = "";

    const cancelCurrentLoad = () => {
        loadGeneration += 1;
        activeAbortController?.abort();
        activeAbortController = null;
        deps.stopTorrentStatusPolling();
        const mediaBunny = deps.getMediaBunny();
        if (mediaBunny) {
            void mediaBunny.destroy();
            deps.setMediaBunny(null);
        }
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

            const canTryClient =
                !opts?.reuseSession &&
                /^https?:\/\//i.test(src) &&
                !/\.m3u8(\?|$)/i.test(src);

            let clientPlayback:
                | Awaited<ReturnType<typeof resolveHttpPlayback>>
                | null = null;

            if (canTryClient) {
                loadingStage.set("Probing stream");
                loadingDetails.set("Checking codecs without the local server...");
                try {
                    clientPlayback = await resolveHttpPlayback(
                        src,
                        deps.getVideoElem(),
                        abortController.signal,
                    );
                } catch (error) {
                    if (error instanceof DOMException && error.name === "AbortError") {
                        return;
                    }
                    console.warn("Client playback probe failed", error);
                    clientPlayback = {
                        mode: isDesktopPlatform ? "server" : "unsupported",
                        meta: null,
                        reason: "probe-error",
                    };
                }
            }

            if (isStale()) return;

            const useClientPlayback =
                clientPlayback?.mode === "direct" ||
                clientPlayback?.mode === "mediabunny";

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
                    directHttp: useClientPlayback,
                },
            );

            if (isStale()) {
                Session.cleanupServerSession(result.sessionId);
                return;
            }

            activeSessionId = result.sessionId;
            deps.setSessionId(result.sessionId);

            const abandonOwnedSession = () => {
                if (!activeSessionId) return;
                Session.cleanupServerSession(activeSessionId);
                activeSessionId = "";
            };

            if (result.sessionData?.isTorrent && result.sessionData?.torrentInfoHash) {
                const torrentInfoHash = result.sessionData.torrentInfoHash;
                deps.startTorrentStatusPolling(torrentInfoHash);
                await deps.awaitTorrentReady(torrentInfoHash);

                const readySession = await decoderFetch(`${serverUrl}/sessions/${result.sessionId}`);
                if (!readySession.ok) {
                    throw new Error("Failed to refresh ready torrent session info");
                }
                result.sessionData = await readySession.json();
            } else {
                deps.stopTorrentStatusPolling();
            }

            if (isStale()) {
                abandonOwnedSession();
                return;
            }

            if (useClientPlayback && clientPlayback) {
                result.sessionData = applyClientAudioTracks(
                    clientPlayback.meta,
                    src,
                    {
                        ...result.sessionData,
                        ...sessionFromProbe(clientPlayback.meta, src),
                    },
                );
            }

            sessionData.set(result.sessionData);

            const playbackStart = await deps.resolvePlaybackStart({
                sessionData: result.sessionData,
                startTime,
                metaData,
                season,
                episode,
            });
            if (isStale()) {
                abandonOwnedSession();
                return;
            }
            const effectiveStartTime = playbackStart.effectiveStartTime;
            deps.setIntroDbChapters(playbackStart.introDbChapters);

            await deps.awaitDomUpdate();
            if (isStale()) {
                abandonOwnedSession();
                return;
            }
            const videoElem = deps.getVideoElem();
            if (!videoElem) {
                abandonOwnedSession();
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

            if (useClientPlayback && clientPlayback) {
                loadingStage.set(
                    clientPlayback.mode === "mediabunny"
                        ? "Remuxing in the app"
                        : "Loading stream directly",
                );
                loadingDetails.set(
                    clientPlayback.mode === "mediabunny"
                        ? "Transcoding incompatible audio with MediaBunny"
                        : "Playing without the local server",
                );
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

                const existingBunny = deps.getMediaBunny();
                if (existingBunny) {
                    await existingBunny.destroy();
                    deps.setMediaBunny(null);
                }

                playbackOffset.set(
                    clientPlayback.mode === "mediabunny"
                        ? Math.max(0, effectiveStartTime)
                        : 0,
                );

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
                }).catch(() => {
                    // ignore
                });

                loading.set(true);

                if (clientPlayback.mode === "mediabunny") {
                    const bunny = new MediaBunnyPlayback();
                    bunny.onWindowStartChange = (globalStart) => {
                        playbackOffset.set(globalStart);
                    };
                    deps.setMediaBunny(bunny);
                    const attached = await bunny.attach(videoElem, src, {
                        startTime: effectiveStartTime,
                        signal: abortController.signal,
                        meta: clientPlayback.meta,
                        audioIndex:
                            result.sessionData?.audioIndex ??
                            clientPlayback.meta?.preferredAudioIndex ??
                            0,
                    });
                    if (isStale()) {
                        await bunny.destroy();
                        deps.setMediaBunny(null);
                        abandonOwnedSession();
                        return;
                    }
                    if (attached.durationSeconds > 0) {
                        duration.set(attached.durationSeconds);
                    }

                    result.sessionData = applyClientAudioTracks(
                        attached.meta,
                        src,
                        result.sessionData,
                        bunny.getAudioIndex(),
                    );
                    sessionData.set(result.sessionData);
                    playbackOffset.set(attached.remuxOrigin);

                    // Fill in disabled/extra container tracks without blocking start.
                    void enrichProbedStreamAudio(
                        src,
                        attached.meta,
                        abortController.signal,
                    )
                        .then((enriched) => {
                            if (isStale()) return;
                            bunny.replaceMeta(enriched);
                            result.sessionData = applyClientAudioTracks(
                                enriched,
                                src,
                                result.sessionData,
                                bunny.getAudioIndex(),
                            );
                            sessionData.set(result.sessionData);
                        })
                        .catch(() => {
                            // ignore
                        });

                    Session.attachSeekingListener(
                        videoElem,
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
                            deps.getMediaBunny,
                        ),
                    );

                    loading.set(false);
                    loadingStage.set("");
                    loadingDetails.set("");
                    showCanvas.set(false);
                    if (!needsSeekStyleModal && deps.autoPlay) {
                        videoElem.play().catch(() => {
                            // ignore
                        });
                    }
                    abandonOwnedSession();
                    return;
                }

                const onLoaded = () => {
                    const currentVideo = deps.getVideoElem();
                    if (!currentVideo) return;

                    if (
                        Number.isFinite(currentVideo.duration) &&
                        currentVideo.duration > 0
                    ) {
                        duration.set(currentVideo.duration);
                    } else if ((clientPlayback.meta?.durationSeconds ?? 0) > 0) {
                        duration.set(clientPlayback.meta!.durationSeconds);
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

                if (clientPlayback.meta) {
                    void enrichProbedStreamAudio(
                        src,
                        clientPlayback.meta,
                        abortController.signal,
                    )
                        .then((enriched) => {
                            if (isStale()) return;
                            clientPlayback.meta = enriched;
                            result.sessionData = applyClientAudioTracks(
                                enriched,
                                src,
                                result.sessionData,
                            );
                            sessionData.set(result.sessionData);
                        })
                        .catch(() => {
                            // ignore
                        });
                }

                abandonOwnedSession();
                return;
            }

            if (clientPlayback?.mode === "unsupported") {
                throw new Error(
                    "This stream needs codecs the browser cannot remux yet. Try another source.",
                );
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
            if (isStale()) {
                abandonOwnedSession();
                return;
            }

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
                    deps.getMediaBunny,
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
            if (activeSessionId) {
                Session.cleanupServerSession(activeSessionId);
                activeSessionId = "";
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
