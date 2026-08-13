import { get } from "svelte/store";
import type { ShowResponse } from "../../lib/library/types/meta_types";
import {
    MediaBunnyPlayback,
    FfmpegPlayback,
    enrichProbedStreamAudio,
    resolveHttpPlayback,
    type ProbedStream,
    type ClientPlaybackController,
} from "../../lib/media";
import {
    canTryClientPlayback,
    isHttpUrl,
    isMagnetUrl,
    toClientPlayableUrl,
} from "../../lib/media/localSource";
import {
    addLimboTorrent,
    LimboUnavailableError,
    removeLimboTorrent,
    type LimboTorrentStatus,
} from "../../lib/limbo/client";
import { ensureTorrentingAllowed } from "../../lib/stores/torrenting";
import { selectedStream } from "../meta/metaState";
import type { Chapter, Track } from "./types";
import * as Session from "./videoSession";
import * as Subtitles from "./subtitles";
import * as Discord from "./discord";
import { autoEnableDefaultSubtitles as applyDefaultSubtitles } from "./subtitleAutoSelect";
import { applyClientAudioTracks, sessionFromProbe } from "./playerSessionMetadata";
import { attachHlsPlayback } from "./hlsPlayback";
import {
    describePlaybackFailure,
    PlaybackPreparationError,
} from "./playbackFailure";
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
    getPlaybackController: () => ClientPlaybackController | null;
    setPlaybackController: (value: ClientPlaybackController | null) => void;
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
    startTorrentStatusPolling: (torrentId: string) => void;
    awaitTorrentReady: (torrentId: string) => Promise<void>;
    stopTorrentStatusPolling: () => void;
    awaitDomUpdate: () => Promise<void>;
};

export function createPlayerSessionLoader(deps: PlayerSessionLoaderDeps) {
    let loadGeneration = 0;
    let activeAbortController: AbortController | null = null;
    let activeLimboTorrentId = "";
    let cleanupPromise = Promise.resolve();

    const attachSeekHandler = (videoElem: HTMLVideoElement) => {
        Session.attachSeekingListener(
            videoElem,
            Session.createSeekHandler(
                videoElem,
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
                deps.getPlaybackController,
                () => get(isPlaying),
            ),
        );
    };

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
        cleanupPromise = cleanupPromise.then(async () => {
            if (playbackController && playbackController !== preservedController) {
                try {
                    await playbackController.destroy();
                } catch (error) {
                    console.warn("Playback cleanup failed", error);
                }
            }
            if (limboTorrentId) {
                await removeLimboTorrent(limboTorrentId, false);
            }
        });
        return cleanupPromise;
    };

    const resolveLimboStream = async (
        magnet: string,
        fileIdx: number | null,
        signal: AbortSignal,
    ): Promise<{ streamUrl: string; status: LimboTorrentStatus }> => {
        loadingStage.set("Connecting to Limbo");
        loadingDetails.set("Making sure Limbo is running…");
        loadingProgress.set(null);

        try {
            await ensureTorrentingAllowed();
        } catch (error) {
            if (error instanceof LimboUnavailableError) {
                throw new Error(
                    `${error.message} Get it at https://limbo.al`,
                );
            }
            throw error;
        }

        if (signal.aborted) throw new DOMException("Aborted", "AbortError");

        loadingStage.set("Waiting for Limbo approval");
        loadingDetails.set("Approve the request in Limbo if prompted…");
        const created = await addLimboTorrent({
            magnet,
            fileIndex: fileIdx,
            sequential: true,
            name: (() => {
                const stream = get(selectedStream);
                if (!stream) return null;
                return (
                    stream.behaviorHints?.filename?.trim() ||
                    stream.title?.trim() ||
                    stream.name?.trim() ||
                    null
                );
            })(),
        });
        activeLimboTorrentId = created.id;
        deps.startTorrentStatusPolling(created.id);
        await deps.awaitTorrentReady(created.id);

        if (signal.aborted) throw new DOMException("Aborted", "AbortError");

        const { getLimboTorrent } = await import("../../lib/limbo/client");
        const ready = await getLimboTorrent(created.id);
        if (!ready.streamUrl) {
            throw new Error("Limbo did not return a stream URL for this torrent");
        }
        return { streamUrl: ready.streamUrl, status: ready };
    };

    const loadVideo = async (
        src: string,
        opts?: {
            reuseSession?: {
                sessionData: any;
                mode?: "direct" | "mediabunny" | "ffmpeg" | "addon-hls" | "unsupported";
                meta?: ProbedStream | null;
                playbackController?: ClientPlaybackController | null;
                hls?: any;
            };
        },
    ) => {
        const cleanup = cancelCurrentLoad(
            opts?.reuseSession?.playbackController ?? null,
            opts?.reuseSession?.hls ?? null,
        );
        const generation = loadGeneration;
        await cleanup;
        if (generation !== loadGeneration) return;
        const abortController = new AbortController();
        activeAbortController = abortController;
        const isStale = () =>
            generation !== loadGeneration || abortController.signal.aborted;

        try {
            const reused = opts?.reuseSession;
            if (
                reused &&
                (reused.mode === "direct" ||
                    reused.mode === "mediabunny" ||
                    reused.mode === "ffmpeg" ||
                    reused.mode === "addon-hls")
            ) {
                loadingStage.set("Continuing");
                loadingDetails.set("");
                loadingProgress.set(null);

                const videoElem = deps.getVideoElem();
                if (!videoElem) return;

                const sessionSource = toClientPlayableUrl(src);
                let nextSession =
                    reused.sessionData && typeof reused.sessionData === "object"
                        ? { ...reused.sessionData }
                        : sessionFromProbe(reused.meta ?? null, sessionSource);

                nextSession = applyClientAudioTracks(
                    reused.meta ?? null,
                    sessionSource,
                    nextSession,
                    reused.playbackController?.getAudioIndex?.(),
                );
                sessionData.set(nextSession);

                const metaData = deps.getMetaData();
                const season = deps.getSeason();
                const episode = deps.getEpisode();

                const durationSeconds =
                    reused.meta?.durationSeconds ||
                    (Number.isFinite(videoElem.duration) ? videoElem.duration : 0) ||
                    nextSession.durationSeconds ||
                    0;
                if (durationSeconds > 0) {
                    duration.set(durationSeconds);
                }

                playbackOffset.set(
                    reused.mode === "mediabunny" || reused.mode === "ffmpeg"
                        ? (reused.playbackController?.getRemuxOrigin?.() ?? 0)
                        : 0,
                );
                currentTime.set(get(playbackOffset));

                subtitleTracks.set([
                    { id: "off", label: "Off", selected: true, group: "None" },
                ]);

                if (
                    (reused.mode === "mediabunny" || reused.mode === "ffmpeg") &&
                    reused.playbackController
                ) {
                    const controller = reused.playbackController;
                    controller.onWindowStartChange = (globalStart) => {
                        playbackOffset.set(globalStart);
                    };
                    deps.setPlaybackController(controller);
                } else if (reused.mode === "addon-hls" && reused.hls) {
                    deps.setHls(reused.hls);
                } else {
                    deps.setPlaybackController(null);
                }
                attachSeekHandler(videoElem);
                if (isStale()) return;

                try {
                    videoElem.muted = false;
                    videoElem.defaultMuted = false;
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

                loading.set(false);
                loadingStage.set("");
                loadingDetails.set("");
                showCanvas.set(false);
                playbackBuffering.set(false);
                if (deps.autoPlay) {
                    videoElem.play().catch(() => {
                        // ignore
                    });
                }

                void deps
                    .resolvePlaybackStart({
                        sessionData: nextSession,
                        startTime: deps.getStartTime(),
                        metaData,
                        season,
                        episode,
                    })
                    .then((playbackStart) => {
                        if (isStale()) return;
                        deps.setIntroDbChapters(playbackStart.introDbChapters);
                        if (
                            playbackStart.effectiveStartTime > 0 &&
                            videoElem.currentTime < playbackStart.effectiveStartTime
                        ) {
                            videoElem.currentTime = playbackStart.effectiveStartTime;
                        }
                    })
                    .catch(() => {
                        // ignore
                    });

                void Subtitles.fetchAddonSubtitles(metaData, season, episode)
                    .then(async (addonTracks) => {
                        if (isStale()) return;
                        if (addonTracks.length > 0) {
                            subtitleTracks.update((current) => [...current, ...addonTracks]);
                        }
                        await applyDefaultSubtitles({
                            sessionData: nextSession,
                            subtitleTracksValue: get(subtitleTracks),
                            videoElem,
                            currentTime: get(currentTime),
                            playbackOffset: get(playbackOffset),
                            cueLinePercent: deps.getCueLinePercent(),
                            setSubtitleTracks: (updater: (tracks: Track[]) => Track[]) =>
                                subtitleTracks.update(updater),
                            setCurrentSubtitleLabel: currentSubtitleLabel.set,
                            handleSubtitleSelect: Subtitles.handleSubtitleSelect,
                        });
                    })
                    .catch(() => {
                        // ignore
                    });
                return;
            }

            loadingStage.set("Initializing playback");
            loadingDetails.set("");
            loadingProgress.set(null);

            const fileIdx = deps.getFileIdx();
            const startTime = deps.getStartTime();
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
                );
                if (isStale()) return;
                playbackSrc = limbo.streamUrl;
                limboStatus = limbo.status;
            }

            const playableSrc = toClientPlayableUrl(playbackSrc);
            const canTryClient =
                !opts?.reuseSession && canTryClientPlayback(playableSrc);

            let clientPlayback:
                | Awaited<ReturnType<typeof resolveHttpPlayback>>
                | null = null;

            if (canTryClient || limboStatus) {
                loadingStage.set("Probing stream");
                loadingDetails.set(
                    limboStatus
                        ? "Checking torrent stream codecs..."
                        : /^https?:\/\//i.test(playableSrc)
                          ? "Checking codecs..."
                          : "Checking local file codecs...",
                );
                try {
                    clientPlayback = await resolveHttpPlayback(
                        playableSrc,
                        deps.getVideoElem(),
                        abortController.signal,
                    );
                } catch (error) {
                    if (error instanceof DOMException && error.name === "AbortError") {
                        return;
                    }
                    console.warn("Client playback probe failed", error);
                    clientPlayback = {
                        mode: "unsupported",
                        meta: null,
                        reason: "probe-error",
                        error: error instanceof Error ? error.message : String(error),
                    };
                }
            }

            if (isStale()) return;

            const useClientPlayback =
                clientPlayback?.mode === "direct" ||
                clientPlayback?.mode === "mediabunny" ||
                clientPlayback?.mode === "ffmpeg" ||
                clientPlayback?.mode === "addon-hls";

            if (limboStatus && !useClientPlayback) {
                const probeReason = String(clientPlayback?.reason || "");
                const probeError = String(clientPlayback?.error || "");
                const details = `${probeReason} ${probeError}`.toLowerCase();
                if (
                    details.includes("404") ||
                    details.includes("not found") ||
                    details.includes("failed to fetch") ||
                    details.includes("network")
                ) {
                    throw new Error(
                        "Limbo could not serve this torrent stream yet. Wait a moment or try another source.",
                    );
                }
                throw new Error(
                    probeReason === "probe-error" || probeReason === "probe-failed"
                        ? "Could not probe the Limbo torrent stream. Try another source."
                        : "This torrent needs codecs Raffi cannot remux yet. Try another source.",
                );
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
                    clientPlayback.mode === "mediabunny" || clientPlayback.mode === "ffmpeg"
                        ? clientPlayback.mode === "ffmpeg"
                            ? "Converting audio"
                            : "Remuxing in the app"
                        : "Loading stream directly",
                );
                loadingDetails.set(
                    clientPlayback.mode === "mediabunny" || clientPlayback.mode === "ffmpeg"
                        ? "Preparing a browser-compatible stream"
                        : "Starting playback",
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

                const existingController = deps.getPlaybackController();
                if (existingController) {
                    await existingController.destroy();
                    deps.setPlaybackController(null);
                }

                playbackOffset.set(
                    clientPlayback.mode === "mediabunny" || clientPlayback.mode === "ffmpeg"
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

                if (clientPlayback.mode === "addon-hls") {
                    attachSeekHandler(videoElem);
                    const hlsInstance = await attachHlsPlayback({
                        video: videoElem,
                        source: sessionSource,
                        startTime: effectiveStartTime,
                        autoPlay: !needsSeekStyleModal && deps.autoPlay,
                        onReady: () => {
                            loading.set(false);
                            loadingStage.set("");
                            loadingDetails.set("");
                            showCanvas.set(false);
                        },
                        onFatalError: (error, failedInstance) => {
                            loading.set(false);
                            loadingStage.set("");
                            loadingDetails.set("");
                            showCanvas.set(false);
                            if (deps.getHls() === failedInstance) {
                                deps.setHls(null);
                            }
                            errorMessage.set("HLS playback failed");
                            errorDetails.set(error.message);
                            showError.set(true);
                        },
                    });
                    deps.setHls(hlsInstance);
                    return;
                }

                if (
                    clientPlayback.mode === "mediabunny" ||
                    clientPlayback.mode === "ffmpeg"
                ) {
                    const controller = clientPlayback.mode === "ffmpeg"
                        ? new FfmpegPlayback()
                        : new MediaBunnyPlayback();
                    controller.onWindowStartChange = (globalStart) => {
                        playbackOffset.set(globalStart);
                    };
                    deps.setPlaybackController(controller);
                    const attached = await controller.attach(
                        videoElem,
                        clientPlayback.mode === "ffmpeg" ? playbackSrc : sessionSource,
                        {
                            startTime: effectiveStartTime,
                            signal: abortController.signal,
                            meta: clientPlayback.meta,
                            audioIndex:
                                clientPlayback.mode === "ffmpeg"
                                    ? undefined
                                    : result.sessionData?.audioIndex ??
                                      clientPlayback.meta?.preferredAudioIndex ??
                                      0,
                        },
                    );
                    if (isStale()) {
                        await controller.destroy();
                        deps.setPlaybackController(null);
                        return;
                    }
                    if (attached.durationSeconds > 0) {
                        duration.set(attached.durationSeconds);
                    }

                    result.sessionData = applyClientAudioTracks(
                        attached.meta,
                        sessionSource,
                        result.sessionData,
                        controller.getAudioIndex(),
                    );
                    sessionData.set(result.sessionData);
                    playbackOffset.set(attached.remuxOrigin);

                    // Fill in disabled/extra container tracks without blocking start.
                    void enrichProbedStreamAudio(
                        sessionSource,
                        attached.meta,
                        abortController.signal,
                    )
                        .then((enriched) => {
                            if (isStale()) return;
                            controller.replaceMeta(enriched);
                            result.sessionData = applyClientAudioTracks(
                                controller.getMeta() ?? enriched,
                                src,
                                result.sessionData,
                                controller.getAudioIndex(),
                            );
                            sessionData.set(result.sessionData);
                        })
                        .catch(() => {
                            // ignore
                        });

                    attachSeekHandler(videoElem);

                    loading.set(false);
                    loadingStage.set("");
                    loadingDetails.set("");
                    showCanvas.set(false);
                    if (!needsSeekStyleModal && deps.autoPlay) {
                        videoElem.play().catch(() => {
                            // ignore
                        });
                    }
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

                if (clientPlayback.meta && isHttpUrl(sessionSource)) {
                    videoElem.crossOrigin = "anonymous";
                } else {
                    videoElem.removeAttribute("crossorigin");
                }
                attachSeekHandler(videoElem);
                videoElem.src = sessionSource;
                videoElem.load();

                if (clientPlayback.meta) {
                    void enrichProbedStreamAudio(
                        sessionSource,
                        clientPlayback.meta,
                        abortController.signal,
                    )
                        .then((enriched) => {
                            if (isStale()) return;
                            clientPlayback.meta = enriched;
                            result.sessionData = applyClientAudioTracks(
                                enriched,
                                sessionSource,
                                result.sessionData,
                            );
                            sessionData.set(result.sessionData);
                        })
                        .catch(() => {
                            // ignore
                        });
                }

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
