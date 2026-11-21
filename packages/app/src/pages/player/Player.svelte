<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import { get } from "svelte/store";
    import { router } from "../../lib/stores/router";
    import PlayerChrome from "../../components/player/chrome/PlayerChrome.svelte";
    import MiniPlayerControls from "../../components/player/MiniPlayerControls.svelte";
    import SeekFeedback from "../../components/player/SeekFeedback.svelte";
    import PlayPauseFeedback from "../../components/player/PlayPauseFeedback.svelte";
    import ShapeLoader from "../../components/common/loading/ShapeLoader.svelte";
    import PlayerVideo from "./components/PlayerVideo.svelte";
    import PlayerLoadingScreen from "./components/PlayerLoadingScreen.svelte";
    import PlayerModals from "./components/PlayerModals.svelte";
    import type { ShowResponse } from "../../lib/library/types/meta_types";
    import { localMode } from "../../lib/stores/authStore";
    import { flushPendingLibraryProgress } from "../../lib/db/db";
    import { autoSkipIntros, miniPlayerOnMinimize } from "../../lib/stores/playbackPreferences";
    import { isDesktopPlatform } from "../../lib/shell/platform";
    import { openExternal } from "../../lib/shell/openExternal";
    import * as NavigationLogic from "../meta/navigationLogic";
    import { markCurrentStreamAsFailed, reopenStreamsOnReturn } from "../meta/streamLogic";
    import * as ProgressLogic from "../meta/progressLogic";
    import { progressMap as metaProgressMap, selectedStream } from "../meta/metaState";
    import type { StreamAvailabilityHint } from "../meta/types";
    import { isLikelyProviderStatusMedia } from "../../lib/streams/streamAvailability";
    import { SeekPreview } from "../../lib/media/preview/seekPreview";
    import { readBufferedRanges, type TimeRange } from "../../components/player/seek/seekTrack";

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
        volume,
        controlsVisible,
        showSkipIntro,
        showNextEpisode,
        currentAudioLabel,
        currentSubtitleLabel,
        seekFeedback,
        showError,
        errorMessage,
        errorDetails,
        showAudioSelection,
        showSubtitleSelection,
        audioTracks,
        subtitleTracks,
        objectFit,
        sessionData,
        pendingSeek,
        seekGuard,
        hasStarted as hasStartedStore,
        currentChapter,
        resetPlayerState,
    } from "./playerState";

    import * as Session from "./session/videoSession";
    import * as Controls from "./controls/playerControls";
    import * as Subtitles from "./subtitles/subtitles";
    import * as Chapters from "./chapters/chapters";
    import * as IntroDb from "./chapters/introdb";
    import * as Discord from "./integrations/discord";
    import * as MediaSession from "./integrations/mediaSession";
    import { createTraktScrobbler, TRAKT_COMPLETION_THRESHOLD } from "./integrations/traktScrobbleManager";
    import { createEmbedPlayback } from "./integrations/embedPlayback";
    import { persistControlsPinned, readControlsPinned } from "./controls/playerPreferences";
    import { createTorrentStatusPoller } from "./session/torrentStatusPolling";
    import { createNextEpisodeHandler, hasNextEpisode as seriesHasNextEpisode } from "./controls/playerNextEpisode";
    import { createPlayerSessionLoader } from "./session/playerSessionLoader";
    import { createBrowserPlaybackGuard } from "./session/health/browserPlaybackGuard";
    import { createPlayerModalHandlers } from "./controls/playerModalHandlers";
    import { canReuseNextEpisodePrefetch, isSamePlaybackSource } from "./session/prefetch/nextEpisodePrefetch";
    import { createNextEpisodePrefetchRunner } from "./session/prefetch/nextEpisodePrefetchRunner";
    import { createPlaybackHealthMonitor } from "./session/health/playbackHealthMonitor";
    import { createSourcePreflight } from "./session/sourcePreflight";
    import { captureBackdrop, episodeArtwork, type LoadingBackdrop } from "./session/loadingBackdrop";
    import type { Chapter } from "./types";

    export let videoSrc: string | null = null;
    export let embedSrc: string | null = null;
    export let fileIdx: number | null = null;
    export let metaData: ShowResponse | null = null;
    export let autoPlay: boolean = true;
    export let onNextEpisode: (() => void) | null = null;
    export let hasStarted = false;
    export let onProgress: ((time: number, duration: number) => void) | null = null;
    export let startTime: number = 0;
    export let season: number | null = null;
    export let episode: number | null = null;
    export let streamAvailability: StreamAvailabilityHint | null = null;

    const imdbID = metaData?.meta?.imdb_id || null;
    const NEXT_EPISODE_PREFETCH_CLICK_GRACE_MS = 750;
    /** Startup only waits this long for intro timings; late results still enable skipping. */
    const INTRO_DB_STARTUP_BUDGET_MS = 1500;
    const SUBTITLE_CONTROLS_MARGIN_PX = 26;
    const TORRENT_FAILURE_EXIT_MS = 1400;

    let playerContainer: HTMLDivElement;
    let canvasElem: HTMLCanvasElement;
    let controlsPanel: HTMLDivElement | null = null;
    let videoSurfaceA: HTMLVideoElement | undefined = undefined;
    let videoSurfaceB: HTMLVideoElement | undefined = undefined;
    let activeVideoSurface: 0 | 1 = 0;
    $: videoElem = (activeVideoSurface === 0 ? videoSurfaceA : videoSurfaceB) as HTMLVideoElement;
    const activeVideo = () => (activeVideoSurface === 0 ? videoSurfaceA : videoSurfaceB) ?? undefined;
    const idleVideo = () => (activeVideoSurface === 0 ? videoSurfaceB : videoSurfaceA) ?? null;

    let hls: any = null;
    let playbackController: import("../../lib/media").ClientPlaybackController | null = null;
    let currentVideoSrc: string | null = null;
    let currentVideoFileIdx: number | null = null;
    let currentEmbedSrc: string | null = null;
    let metadataCheckInterval: ReturnType<typeof setInterval> | undefined;
    let errorModalOpen = false;
    let reprobeAttempted = false;
    let torrentFailureExitTimeout: ReturnType<typeof setTimeout> | null = null;
    let introDbChapters: Chapter[] = [];
    let effectiveChapterMarkers: Chapter[] = [];
    let skipButtonLabel = "Skip Intro";
    let bingeAutoAdvancing = false;
    let isTearingDown = false;
    let miniPlayerActive = false;
    let loadingBackdrop: LoadingBackdrop = { src: null, mode: "art" };
    let pictureAspect: number | null = null;
    let clipPanelOpen = false;
    let controlsPinned = readControlsPinned();
    let cueLinePercent = 92;
    let resizeCounter = 0;
    let cueRecalcTimeout: number | null = null;
    let lastControlsVisible: boolean | null = null;
    let lastMiniPlayerActive: boolean | null = null;
    let playPauseFeedback: { type: "play" | "pause"; id: number } | null = null;
    let playPauseFeedbackTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleProgressInternal = (time: number, dur: number) => {
        if (onProgress) onProgress(time, dur);
        else if (imdbID) ProgressLogic.handleProgress(time, dur, imdbID, hasStarted);
    };

    const clearWatchedProgressOnStart = () => {
        const progressKey = metaData?.meta?.type === "series" && season != null && episode != null ? `${season}:${episode}` : undefined;
        if (!ProgressLogic.getProgress(get(metaProgressMap), progressKey)?.watched) return;
        handleProgressInternal(videoElem ? videoElem.currentTime : $currentTime, $duration);
    };

    const nextEpisodePrefetch = imdbID ? createNextEpisodePrefetchRunner(imdbID, idleVideo) : null;

    const playNextEpisode = async () => {
        const resolved = await nextEpisodePrefetch?.takeResolved(NEXT_EPISODE_PREFETCH_CLICK_GRACE_MS);
        if (resolved) return NavigationLogic.playResolvedNextEpisode(resolved, get(metaProgressMap));
        if (onNextEpisode) return onNextEpisode();
        if (imdbID) return NavigationLogic.handleNextEpisode(imdbID, get(metaProgressMap));
    };

    const requestIntroDbChapters = (meta: ShowResponse | null, requestedSeason: number | null, requestedEpisode: number | null) => {
        if (meta?.meta?.type !== "series") return Promise.resolve([] as Chapter[]);
        return IntroDb.fetchIntroDbChapters(meta.meta.imdb_id, requestedSeason, requestedEpisode).catch((error) => {
            console.warn("Failed to fetch IntroDB chapters", error);
            return [] as Chapter[];
        });
    };

    const handleToggleObjectFit = () => {
        const nextFit = $objectFit === "contain" ? "cover" : "contain";
        objectFit.set(nextFit);
        Controls.applyObjectFit(nextFit, videoElem, canvasElem);
        if (!videoElem || !canvasElem) return;
        Session.captureFrame(videoElem, canvasElem);
        if ($showCanvas || $loading) return;
        showCanvas.set(true);
        requestAnimationFrame(() => {
            if (!$loading) showCanvas.set(false);
        });
    };

    const browserPlaybackGuard = createBrowserPlaybackGuard({
        getVideo: () => videoElem,
        getSource: () => currentVideoSrc || videoSrc || "",
        hasEmbed: () => Boolean(embedSrc),
        isDesktop: isDesktopPlatform,
        showError: (reason, details) => {
            loading.set(false);
            showCanvas.set(false);
            showError.set(true);
            errorMessage.set("Browser cannot play this stream");
            errorDetails.set(`${reason} ${details}`);
        },
    });

    const embedPlayback = createEmbedPlayback({
        isActive: () => Boolean(embedSrc),
        getContext: () => ({ imdbId: imdbID, metaData, season, episode }),
        onStarted: () => (hasStarted = true),
    });

    const traktScrobbler = createTraktScrobbler({
        isLocalMode: () => $localMode,
        getImdbId: () => imdbID,
        getHasStarted: () => hasStarted,
        getMediaType: () => (metaData?.meta?.type === "series" ? "episode" : "movie"),
        getSeasonEpisode: () => ({ season, episode }),
        getProgress: () => ($duration > 0 ? Math.max(0, Math.min(100, ($currentTime / $duration) * 100)) : 0),
    });

    const stopTrakt = () => {
        if (hasStarted && !traktScrobbler.isStopSent()) void traktScrobbler.send("stop", true);
    };

    let fullscreenExited = false;
    const leaveFullscreen = async () => {
        if (fullscreenExited) return;
        fullscreenExited = true;
        await Controls.exitFullscreen();
    };

    const handleClose = async () => {
        window.electronAPI?.windowControls?.exitMiniPlayer?.();
        if (imdbID) void flushPendingLibraryProgress(imdbID);
        stopTrakt();
        await leaveFullscreen();
        void playerSessionLoader.cancelCurrentLoad();
        if (!router.back()) router.navigate("home");
    };

    const returnToStreams = () => {
        reopenStreamsOnReturn(imdbID);
        void handleClose();
    };

    const playbackHealth = createPlaybackHealthMonitor({
        hasStarted: () => hasStarted,
        reopenStream: () => {
            if (currentVideoSrc && videoElem) loadVideo(currentVideoSrc, { startTime: videoElem.currentTime });
        },
    });
    const healthPromptVisible = playbackHealth.promptVisible;

    const handleTorrentError = (message: string) => {
        if (torrentFailureExitTimeout) clearTimeout(torrentFailureExitTimeout);
        const details = String(message || "").trim();
        const reason = details
            ? `Bad torrent stream: ${details}. Please select another stream.`
            : "Bad torrent stream. Please select another stream.";
        markCurrentStreamAsFailed(reason);
        loading.set(false);
        showCanvas.set(false);
        showError.set(true);
        errorMessage.set("Stream failed");
        errorDetails.set(reason);
        reopenStreamsOnReturn(imdbID);
        torrentFailureExitTimeout = setTimeout(() => {
            torrentFailureExitTimeout = null;
            showError.set(false);
            void handleClose();
        }, TORRENT_FAILURE_EXIT_MS);
    };

    const torrentStatusPoller = createTorrentStatusPoller({ onTorrentError: handleTorrentError });

    const sourcePreflight = createSourcePreflight({
        getAvailability: () => streamAvailability,
        isStillRequested: (source) => isSamePlaybackSource(videoSrc, fileIdx, source.src, source.fileIdx),
        start: (source) => transitionToVideoSource(source.src, source.fileIdx),
        redirect: (src) => (videoSrc = src),
        onCheckStarted: () => (loadingBackdrop = episodeArtwork(metaData, season, episode)),
    });
    const availabilityNoticeVisible = sourcePreflight.noticeVisible;

    const playerSessionLoader = createPlayerSessionLoader({
        getFileIdx: () => fileIdx,
        getStartTime: () => startTime,
        autoPlay,
        getMetaData: () => metaData,
        getSeason: () => season,
        getEpisode: () => episode,
        getVideoElem: activeVideo,
        getHls: () => hls,
        setHls: (value) => (hls = value),
        getPlaybackController: () => playbackController,
        setPlaybackController: (value) => (playbackController = value),
        getCueLinePercent: () => cueLinePercent,
        setHasStarted: (value) => (hasStarted = value),
        setIntroDbChapters: (chapters) => (introDbChapters = chapters),
        handleProviderStatusMedia: ({ source, meta }) => {
            if (
                !streamAvailability ||
                !isLikelyProviderStatusMedia({
                    expectedSizeBytes: streamAvailability.expectedSizeBytes,
                    durationSeconds: meta.durationSeconds,
                })
            ) {
                return false;
            }
            sourcePreflight.block(videoSrc || source);
            showError.set(false);
            return true;
        },
        resolvePlaybackStart: async ({ sessionData, startTime, metaData: loadMetaData, season: loadSeason, episode: loadEpisode }) => {
            const request = requestIntroDbChapters(loadMetaData, loadSeason, loadEpisode);
            const nextIntroDbChapters = await Promise.race([
                request,
                new Promise<null>((resolve) => setTimeout(() => resolve(null), INTRO_DB_STARTUP_BUDGET_MS)),
            ]);
            if (nextIntroDbChapters === null) {
                void request.then((chapters) => {
                    if (metaData === loadMetaData && season === loadSeason && episode === loadEpisode) introDbChapters = chapters;
                });
            }
            const effectiveChapters = Chapters.getEffectiveChapterSegments(sessionData, nextIntroDbChapters ?? []);
            return {
                effectiveStartTime: Chapters.getStartupSkipTarget(startTime, effectiveChapters, $autoSkipIntros),
                introDbChapters: nextIntroDbChapters ?? [],
            };
        },
        startTorrentStatusPolling: torrentStatusPoller.start,
        awaitTorrentReady: torrentStatusPoller.waitUntilReady,
        stopTorrentStatusPolling: torrentStatusPoller.stop,
        awaitDomUpdate: tick,
    });

    const loadVideo: typeof playerSessionLoader.loadVideo = (src, opts) => {
        void requestIntroDbChapters(metaData, season, episode);
        return playerSessionLoader.loadVideo(src, opts);
    };

    const captureLoadingBackdrop = () => {
        loadingBackdrop = hasStarted
            ? captureBackdrop(videoElem, canvasElem, loadingBackdrop)
            : episodeArtwork(metaData, season, episode);
    };

    const seekToTime = (targetTime: number) => {
        if (!videoElem) return;
        captureLoadingBackdrop();
        Session.performSeek({
            targetTime,
            duration: $duration,
            videoElem,
            captureFrame: () => Session.captureFrame(videoElem, canvasElem),
            onAfterSeek: () => {
                if (hasStarted) Discord.updateDiscordActivity(metaData, season, episode, $duration, $currentTime, $isPlaying);
            },
            setPendingSeek: pendingSeek.set,
            setCurrentTime: currentTime.set,
            setShowCanvas: showCanvas.set,
            hasPlaybackController: Boolean(playbackController),
        });
    };

    const togglePlayWithFeedback = () => {
        if (!videoElem) return;
        if (playPauseFeedbackTimeout) clearTimeout(playPauseFeedbackTimeout);
        playPauseFeedback = { type: videoElem.paused ? "play" : "pause", id: Date.now() };
        playPauseFeedbackTimeout = setTimeout(() => (playPauseFeedback = null), 450);
        controlsManager.togglePlay(controlsVisible.set);
    };

    const togglePlaybackFromMiniPlayer = () => {
        if (!videoElem) return;
        if (videoElem.paused) void videoElem.play();
        else videoElem.pause();
    };

    const showActionLoading = (actionLabel: string, err: unknown) => {
        bingeAutoAdvancing = false;
        loading.set(false);
        showError.set(true);
        errorMessage.set(actionLabel);
        errorDetails.set(err instanceof Error ? err.message : String(err));
    };

    const handleNextEpisodeClick = createNextEpisodeHandler({
        handleProgressInternal,
        getVideoSrc: () => videoSrc,
        setCurrentVideoSrc: (value) => (currentVideoSrc = value),
        invokeNextEpisode: playNextEpisode,
        showActionLoading,
        suppressInitialLoading: () => nextEpisodePrefetch?.handoff != null,
        onNextEpisodeFailed: () => (bingeAutoAdvancing = false),
    });

    const reloadSession = () => {
        if (!currentVideoSrc) return;
        const resumeAt = hasStarted && videoElem ? videoElem.currentTime : undefined;
        playerSessionLoader.cancelCurrentLoad();
        Session.cleanupSession(hls, Discord.clearDiscordActivity, videoElem);
        loadVideo(currentVideoSrc, { startTime: resumeAt });
    };

    const modalHandlers = createPlayerModalHandlers({
        getVideoElem: activeVideo,
        getCueLinePercent: () => cueLinePercent,
        getVideoSrc: () => videoSrc,
        loadVideo: (src) => (src === currentVideoSrc ? reloadSession() : loadVideo(src)),
        handleClose,
        getPlaybackController: () => playbackController,
    });

    const retryInitialSource = () => {
        if (videoSrc && currentVideoSrc !== videoSrc && sourcePreflight.retry({ src: videoSrc, fileIdx })) return;
        modalHandlers.onErrorRetry();
    };

    const resetForNewSource = () => {
        introDbChapters = [];
        effectiveChapterMarkers = [];
        skipButtonLabel = "Skip Intro";
        hasStarted = false;
        bingeAutoAdvancing = false;
    };

    const transitionToVideoSource = (nextVideoSrc: string, nextFileIdx: number | null) => {
        embedPlayback.cancelLoading();
        currentEmbedSrc = null;
        resetForNewSource();
        currentVideoSrc = nextVideoSrc;
        currentVideoFileIdx = nextFileIdx;
        playbackHealth.reset();

        const handoff = nextEpisodePrefetch?.handoff ?? null;
        const canReuseHandoff = canReuseNextEpisodePrefetch(handoff, nextVideoSrc, nextFileIdx, startTime);
        const previousController = playbackController;
        const previousHls = hls;
        // Keep MediaSource on the same element by flipping which surface is visible.
        if (canReuseHandoff) activeVideoSurface = activeVideoSurface === 0 ? 1 : 0;
        const reuseSession = canReuseHandoff && handoff
            ? {
                  sessionData: handoff.sessionData,
                  mode: handoff.mode,
                  meta: handoff.meta,
                  playbackController: handoff.playbackController,
                  hls: handoff.hls,
              }
            : undefined;

        playerSessionLoader.cancelCurrentLoad();
        handleNextEpisodeClick.cancel();
        nextEpisodePrefetch?.dispose(reuseSession ? { transfer: true } : undefined);

        if (reuseSession?.playbackController) playbackController = reuseSession.playbackController;
        else if (!canReuseHandoff) playbackController = null;
        if (previousHls && previousHls !== reuseSession?.hls) previousHls.destroy();
        if (reuseSession?.hls) hls = reuseSession.hls;
        else if (!canReuseHandoff) hls = null;

        const idle = idleVideo();
        if (canReuseHandoff && idle && !previousController) {
            idle.pause();
            idle.removeAttribute("src");
            idle.load();
        }

        Session.cleanupSession(null, Discord.clearDiscordActivity, canReuseHandoff ? null : videoElem);
        loadVideo(nextVideoSrc, reuseSession ? { reuseSession } : undefined);
    };

    const runChapterAutomation = (time: number) => {
        const result = Chapters.checkChapters(time, $sessionData, $duration, metaData, introDbChapters);
        currentChapter.set(result.currentChapter);
        showSkipIntro.set(result.showSkipIntro);
        const skipLanding = Chapters.upcomingSkipLanding(time, $sessionData, introDbChapters);
        if (skipLanding != null) playbackController?.prepareSeek(skipLanding);
        showNextEpisode.set(result.showNextEpisode);
        skipButtonLabel = result.skipButtonLabel;

        if (bingeNextSupported) {
            const action = Chapters.getBingeAction(time, result.currentChapter, {
                sessionData: $sessionData,
                introDbChapters,
                duration: $duration,
                autoSkipIntros: $autoSkipIntros,
            });
            if (action?.kind === "skip") return seekToTime(action.to);
            if (action?.kind === "next" && !bingeAutoAdvancing) {
                bingeAutoAdvancing = true;
                return handleNextEpisodeClick();
            }
        }

        if (hasNextEpisode) nextEpisodePrefetch?.maybeStart(time, nextEpisodePrefetchWindow);
    };

    const handleTimeUpdate = () => {
        if (!videoElem || isTearingDown || $pendingSeek != null || $seekGuard) return;
        const time = videoElem.currentTime;
        currentTime.set(time);
        handleProgressInternal(time, $duration);
        if (!traktScrobbler.isStopSent() && $duration > 0 && time / $duration >= TRAKT_COMPLETION_THRESHOLD) {
            void traktScrobbler.send("stop", true);
        }
        runChapterAutomation(time);
    };

    const handlePlay = () => {
        torrentStatusPoller.stop();
        isPlaying.set(true);
    };

    const handlePlaying = () => {
        handlePlay();
        hasStarted = true;
        pictureAspect = videoElem.videoHeight ? videoElem.videoWidth / videoElem.videoHeight : null;
        clearWatchedProgressOnStart();
        void traktScrobbler.send("start");
        Discord.updateDiscordActivity(metaData, season, episode, $duration, $currentTime, true);
        playbackBuffering.set(false);
        loading.set(false);
        loadingStage.set("");
        loadingDetails.set("");
        loadingProgress.set(null);
        playbackHealth.bufferEnd();
        browserPlaybackGuard.scheduleAudioCheck();
    };

    const handlePause = () => {
        // Hard seeks pause the element on purpose while remux/HLS rebuilds — not a user pause.
        if (get(seekGuard) || get(pendingSeek) != null) return;
        if (!hasStarted) {
            Discord.clearDiscordActivity();
            return;
        }
        isPlaying.set(false);
        if (!traktScrobbler.isStopSent() && !($duration > 0 && $currentTime / $duration >= TRAKT_COMPLETION_THRESHOLD)) {
            void traktScrobbler.send("pause");
        }
        Discord.updateDiscordActivity(metaData, season, episode, $duration, $currentTime, false);
    };

    const handleWaiting = () => {
        if (hasStarted) {
            playbackBuffering.set(true);
        } else {
            captureLoadingBackdrop();
            loading.set(true);
            loadingStage.set("Buffering");
        }
        playbackHealth.bufferStart();
    };

    const handleCanPlay = () => {
        playbackBuffering.set(false);
        loading.set(false);
        playbackHealth.bufferEnd();
    };

    const handleEnded = () => {
        stopTrakt();
        if (bingeNextSupported && hasNextEpisode && !bingeAutoAdvancing) {
            bingeAutoAdvancing = true;
            handleNextEpisodeClick();
        }
    };

    const checkMetadata = () => {
        if (!videoElem) return;
        const time = videoElem.currentTime;
        if (time <= 2 || videoElem.paused || !(isNaN(videoElem.duration) || videoElem.duration === 0)) return;
        if (!reprobeAttempted) {
            reprobeAttempted = true;
            reloadSession();
        } else if (time > 10) {
            showError.set(true);
            errorMessage.set("Stream Error");
            errorDetails.set("Metadata missing. Please select another stream.");
            videoElem.pause();
            clearInterval(metadataCheckInterval);
        }
    };

    const recomputeCueLinePercent = () => {
        cueLinePercent = Subtitles.computeCueLinePercent(playerContainer, controlsPanel, $controlsVisible, SUBTITLE_CONTROLS_MARGIN_PX);
        Subtitles.updateCuePositions(videoElem, cueLinePercent);
    };

    let seekPreview: SeekPreview | null = null;
    let bufferedRanges: TimeRange[] = [];
    const refreshBuffered = () => {
        if (!videoElem) return;
        const next = readBufferedRanges(videoElem.buffered, bufferedRanges);
        if (next !== bufferedRanges) bufferedRanges = next;
    };
    const followSeekPreviewSource = (src: string | null) => {
        if (seekPreview?.src === src) return;
        seekPreview?.dispose();
        seekPreview = src ? new SeekPreview(src) : null;
    };

    onMount(() => {
        resetPlayerState();
        hasStarted = false;
        const windowControls = window.electronAPI?.windowControls;
        const removeMiniPlayerChanged = windowControls?.onMiniPlayerChanged?.((value) => (miniPlayerActive = value));
        void windowControls?.isMiniPlayer?.().then((value) => (miniPlayerActive = value));
        loadingStage.set("Loading...");
        loadingDetails.set("");
        loadingProgress.set(null);
        window.addEventListener("message", embedPlayback.handleMessage);
        metadataCheckInterval = setInterval(checkMetadata, 1000);
        return () => {
            if (typeof removeMiniPlayerChanged === "function") removeMiniPlayerChanged();
            window.removeEventListener("message", embedPlayback.handleMessage);
        };
    });

    onDestroy(() => {
        isTearingDown = true;
        MediaSession.clearMediaSession();
        followSeekPreviewSource(null);
        sourcePreflight.cancel();
        window.electronAPI?.windowControls?.syncMiniPlayerState?.({ enabled: false, canEnter: false });
        window.electronAPI?.windowControls?.exitMiniPlayer?.();
        if (imdbID) void flushPendingLibraryProgress(imdbID);
        stopTrakt();
        void leaveFullscreen();
        clearInterval(metadataCheckInterval);
        torrentStatusPoller.stop();
        if (playPauseFeedbackTimeout) clearTimeout(playPauseFeedbackTimeout);
        if (torrentFailureExitTimeout) clearTimeout(torrentFailureExitTimeout);
        playbackHealth.dispose();
        embedPlayback.cancelLoading();
        browserPlaybackGuard.clearAudioCheck();
        playerSessionLoader.cancelCurrentLoad();
        Subtitles.releaseUploadedSubtitleUrls();
        nextEpisodePrefetch?.dispose();
        void playbackController?.destroy();
        playbackController = null;
        Session.cleanupSession(hls, Discord.clearDiscordActivity, videoElem);
        resetPlayerState();
        hasStarted = false;
    });

    $: hasNextEpisode = seriesHasNextEpisode(metaData, season, episode);
    $: bingeNextSupported = metaData?.meta?.type === "series" && Boolean($selectedStream?.behaviorHints?.bingeGroup);
    $: nextEpisodePrefetchWindow = Chapters.getNextEpisodePrefetchWindow($duration, $sessionData, introDbChapters);
    $: nextEpisodeHighlighted = $currentChapter?.kind === "outro";
    $: hasStartedStore.set(hasStarted);
    $: controlsManager = Controls.createControlsManager(playerContainer, videoElem);
    $: controlsManager?.setPinned(clipPanelOpen || controlsPinned, controlsVisible.set);
    $: effectiveChapterMarkers = Chapters.getEffectiveChapterSegments($sessionData, introDbChapters);
    $: followSeekPreviewSource($sessionData?.isDirectHttp ? $sessionData.sourceUrl : null);
    $: if (videoElem) videoElem.muted = false;
    $: if ($loading && !hasStarted) loadingBackdrop = episodeArtwork(metaData, season, episode);

    $: if ($showError && !errorModalOpen) {
        Discord.clearDiscordActivity();
        loading.set(false);
        loadingStage.set("");
        loadingDetails.set("");
        loadingProgress.set(null);
        playbackBuffering.set(false);
        errorModalOpen = true;
    }
    $: if (!$showError && errorModalOpen) errorModalOpen = false;
    $: if ($availabilityNoticeVisible) Discord.clearDiscordActivity();

    const seekWithMediaKeys = (time: number) => seekToTime(Math.max(0, Math.min(time, $duration)));
    $: MediaSession.setNowPlaying(metaData, season, episode);
    $: MediaSession.bindMediaControls({
        togglePlay: togglePlayWithFeedback,
        seekTo: seekWithMediaKeys,
        seekBy: (seconds) => seekWithMediaKeys($currentTime + seconds),
        nextEpisode: hasNextEpisode ? handleNextEpisodeClick : null,
    });

    $: if (embedSrc && embedSrc !== currentEmbedSrc) {
        currentEmbedSrc = embedSrc;
        currentVideoSrc = embedSrc;
        currentVideoFileIdx = null;
        resetForNewSource();
        currentTime.set(0);
        duration.set(0);
        playerSessionLoader.cancelCurrentLoad();
        nextEpisodePrefetch?.dispose();
        handleNextEpisodeClick.cancel();
        Session.cleanupSession(hls, Discord.clearDiscordActivity, videoElem);
        hls = null;
        showError.set(false);
        embedPlayback.begin();
    }

    $: if (videoSrc && !isSamePlaybackSource(videoSrc, fileIdx, currentVideoSrc, currentVideoFileIdx)) {
        sourcePreflight.request({ src: videoSrc, fileIdx });
    }

    $: isPlayerRoute = $router.page === "player";
    $: canEnterMiniPlayer = Boolean(isPlayerRoute && $miniPlayerOnMinimize && videoSrc && !$showError && ($isPlaying || miniPlayerActive));
    $: window.electronAPI?.windowControls?.syncMiniPlayerState?.({ enabled: $miniPlayerOnMinimize && isPlayerRoute, canEnter: canEnterMiniPlayer });
    $: if (miniPlayerActive && !canEnterMiniPlayer) window.electronAPI?.windowControls?.exitMiniPlayer?.();
    $: if (lastMiniPlayerActive !== miniPlayerActive) {
        lastMiniPlayerActive = miniPlayerActive;
        resizeCounter += 1;
    }

    $: {
        resizeCounter;
        cueLinePercent = Subtitles.computeCueLinePercent(playerContainer, controlsPanel, $controlsVisible, SUBTITLE_CONTROLS_MARGIN_PX);
    }
    $: Subtitles.updateCuePositions(videoElem, cueLinePercent);
    $: if (lastControlsVisible !== $controlsVisible) {
        lastControlsVisible = $controlsVisible;
        recomputeCueLinePercent();
        // Follow the controls while they slide, then once more after they settle.
        requestAnimationFrame(() => requestAnimationFrame(recomputeCueLinePercent));
        if (cueRecalcTimeout != null) clearTimeout(cueRecalcTimeout);
        cueRecalcTimeout = window.setTimeout(recomputeCueLinePercent, 350);
    }
</script>

<svelte:window
    on:mousemove={() => controlsManager.handleMouseMove(controlsVisible.set)}
    on:resize={() => (resizeCounter += 1)}
    on:keydown={(e) =>
        controlsManager.handleKeydown(e, $currentTime, $duration, $volume, seekToTime, volume.set, seekFeedback.set, togglePlayWithFeedback)}
/>

<div
    class="group fixed inset-0 z-100 h-full w-full overflow-hidden bg-black {$controlsVisible ? 'cursor-default' : 'cursor-none'}"
    bind:this={playerContainer}
    role="presentation"
>
    <div class="h-full w-full">
        {#if embedSrc}
            <iframe
                src={embedSrc}
                title={metaData?.meta?.name || "Embedded player"}
                class="h-full w-full bg-black {$controlsVisible ? 'pointer-events-auto' : 'pointer-events-none'}"
                allow="autoplay *; fullscreen *; encrypted-media *; picture-in-picture *"
                allowfullscreen
                referrerpolicy="no-referrer"
                on:load={embedPlayback.loaded}
            ></iframe>
        {:else}
            <PlayerVideo
                bind:videoA={videoSurfaceA}
                bind:videoB={videoSurfaceB}
                activeSurface={activeVideoSurface}
                bind:canvasElem
                objectFit={$objectFit}
                showCanvas={$showCanvas}
                on:timeupdate={handleTimeUpdate}
                on:timeupdate={refreshBuffered}
                on:progress={refreshBuffered}
                on:play={handlePlay}
                on:pause={handlePause}
                on:ended={handleEnded}
                on:click={() => !miniPlayerActive && togglePlayWithFeedback()}
                on:waiting={handleWaiting}
                on:playing={handlePlaying}
                on:canplay={handleCanPlay}
                on:error={browserPlaybackGuard.handleVideoError}
            />
        {/if}
    </div>

    {#if playPauseFeedback && !embedSrc}
        <PlayPauseFeedback type={playPauseFeedback.type} id={playPauseFeedback.id} />
    {/if}

    {#if miniPlayerActive && !embedSrc}
        <MiniPlayerControls
            currentTime={$currentTime}
            duration={$duration}
            pendingSeek={$pendingSeek}
            loading={$loading}
            isPlaying={$isPlaying}
            onTogglePlayback={togglePlaybackFromMiniPlayer}
            onSeekInput={(time) => controlsManager.onSeekInput(time, pendingSeek.set)}
            onSeekChange={(time) => controlsManager.onSeekChange(time, seekToTime)}
        />
    {/if}

    {#if $seekFeedback && !embedSrc}
        <SeekFeedback type={$seekFeedback.type} id={$seekFeedback.id} />
    {/if}

    <PlayerLoadingScreen
        loading={$loading && !miniPlayerActive}
        onClose={handleClose}
        {metaData}
        {season}
        {episode}
        backdropSrc={loadingBackdrop.src}
        backdropMode={loadingBackdrop.mode}
        stage={$loadingStage}
        details={$loadingDetails}
        progress={$loadingProgress}
        showError={$showError && !hasStarted && !miniPlayerActive}
        errorMessage={$errorMessage}
        errorDetails={$errorDetails}
        onRetry={retryInitialSource}
        onBack={modalHandlers.onErrorBack}
        onDownloadDesktop={() => void openExternal("https://raffi.al/#download")}
        showNotice={$availabilityNoticeVisible && !miniPlayerActive}
        noticeTitle="Not available on demand"
        noticeDetails="{streamAvailability?.providerLabel || 'Your debrid provider'} is still preparing this source. Check your dashboard, then try again once it's cached."
        noticePrimaryLabel="Back to Streams"
        noticeSecondaryLabel={streamAvailability?.dashboardUrl ? "Open Dashboard" : ""}
        onNoticePrimary={returnToStreams}
        onNoticeSecondary={() => streamAvailability?.dashboardUrl && void openExternal(streamAvailability.dashboardUrl)}
    />

    {#if $playbackBuffering && !$loading && !miniPlayerActive && !embedSrc}
        <div class="pointer-events-none absolute inset-0 z-40 flex items-center justify-center" aria-label="Buffering">
            <ShapeLoader size="44px" class="opacity-80" />
        </div>
    {/if}

    {#if !$loading && !miniPlayerActive}
        <PlayerChrome
            visible={$controlsVisible}
            {metaData}
            {season}
            {episode}
            skipLabel={$showSkipIntro ? skipButtonLabel : null}
            onSkip={() => Chapters.skipChapter($currentChapter, seekToTime)}
            {hasNextEpisode}
            {nextEpisodeHighlighted}
            onNextEpisode={handleNextEpisodeClick}
            showHealthPrompt={$healthPromptVisible}
            onChooseAnotherStream={() => {
                playbackHealth.dismiss();
                returnToStreams();
            }}
            onKeepWatching={playbackHealth.dismiss}
            onClose={handleClose}
            {pictureAspect}
            bind:panel={controlsPanel}
            controls={embedSrc ? null : {
                isPlaying: $isPlaying,
                duration: $duration,
                currentTime: $currentTime,
                pendingSeek: $pendingSeek,
                volume: $volume,
                chapterMarkers: effectiveChapterMarkers,
                seekPreview,
                buffered: bufferedRanges,
                visible: $controlsVisible,
                videoSrc,
                canDownload: Boolean(metaData),
                currentAudioLabel: $currentAudioLabel,
                currentSubtitleLabel: $currentSubtitleLabel,
                objectFit: $objectFit,
                togglePlay: togglePlayWithFeedback,
                onSeekInput: (time) => controlsManager.onSeekInput(time, pendingSeek.set),
                onSeekChange: (time) => controlsManager.onSeekChange(time, seekToTime),
                onVolumeChange: (value) => controlsManager.onVolumeChange(value, volume.set),
                toggleFullscreen: () => void controlsManager.toggleFullscreen(),
                toggleObjectFit: handleToggleObjectFit,
                onAudioClick: () => showAudioSelection.set(true),
                onSubtitleClick: () => showSubtitleSelection.set(true),
                onClipPanelOpenChange: (open) => (clipPanelOpen = open),
                pinned: controlsPinned,
                onTogglePin: () => persistControlsPinned((controlsPinned = !controlsPinned)),
            }}
        />
    {/if}

    <PlayerModals
        showAudioSelection={$showAudioSelection}
        showSubtitleSelection={$showSubtitleSelection}
        showError={$showError && (hasStarted || miniPlayerActive)}
        audioTracks={$audioTracks}
        subtitleTracks={$subtitleTracks}
        errorMessage={$errorMessage}
        errorDetails={$errorDetails}
        onAudioSelect={modalHandlers.onAudioSelect}
        onSubtitleSelect={modalHandlers.onSubtitleSelect}
        onSubtitleUpload={modalHandlers.onSubtitleUpload}
        onSubtitleDelayChange={modalHandlers.onSubtitleDelayChange}
        onErrorRetry={modalHandlers.onErrorRetry}
        onErrorBack={modalHandlers.onErrorBack}
        onDownloadDesktop={() => void openExternal("https://raffi.al/#download")}
        onCloseAudio={modalHandlers.onCloseAudio}
        onCloseSubtitle={modalHandlers.onCloseSubtitle}
    />
</div>
