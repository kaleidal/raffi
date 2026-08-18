<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import { get } from "svelte/store";
    import { router } from "../../lib/stores/router";
    import PlayerControls from "../../components/player/PlayerControls.svelte";
    import MiniPlayerControls from "../../components/player/MiniPlayerControls.svelte";
    import PlayerOverlays from "../../components/player/PlayerOverlays.svelte";
    import SeekFeedback from "../../components/player/SeekFeedback.svelte";
    import PlayPauseFeedback from "../../components/player/PlayPauseFeedback.svelte";
    import PlayerVideo from "./components/PlayerVideo.svelte";
    import PlayerLoadingScreen from "./components/PlayerLoadingScreen.svelte";
    import PlayerModals from "./components/PlayerModals.svelte";
    import PlayerWatchParty from "./components/PlayerWatchParty.svelte";
    import LoadingSpinner from "../../components/common/LoadingSpinner.svelte";
    import type { ShowResponse } from "../../lib/library/types/meta_types";
    import { watchParty } from "../../lib/stores/watchPartyStore";
    import { localMode } from "../../lib/stores/authStore";
    import { cloudSyncStatus, flushPendingLibraryProgress } from "../../lib/db/db";
    import {
        autoSkipIntros,
        miniPlayerOnMinimize,
    } from "../../lib/stores/playbackPreferences";
    import { ChevronLeft, SkipForward } from "@lucide/svelte";
    import * as NavigationLogic from "../meta/navigationLogic";
    import { streamToPlayableUrl } from "../meta/streamLogic";
    import * as ProgressLogic from "../meta/progressLogic";
    import { progressMap as metaProgressMap, streamsPopupVisible, selectedStream } from "../meta/metaState";
    import { markCurrentStreamAsFailed } from "../meta/streamLogic";
    import { isDesktopPlatform } from "../../lib/platform";
    import {
        isLikelyProviderStatusMedia,
        isStreamPreparationPending,
        preflightStreamUrl,
    } from "../../lib/streams/streamAvailability";
    import type { StreamAvailabilityHint } from "../meta/types";

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
        showWatchPartyModal,
        showPartyEndModal,
        partyEndReason,
        showAudioSelection,
        showSubtitleSelection,
        audioTracks,
        subtitleTracks,
        objectFit,
        playbackOffset,
        sessionData,
        pendingSeek,
        seekGuard,
        showSeekStyleModal,
        hasStarted as hasStartedStore,
        currentChapter,
        resetPlayerState,
    } from "./playerState";

    import * as Session from "./videoSession";
    import * as Controls from "./playerControls";
    import * as Subtitles from "./subtitles";
    import * as Chapters from "./chapters";
    import * as IntroDb from "./introdb";
    import * as Discord from "./discord";
    import * as WatchParty from "./watchParty";
    import {
        acknowledgeSeekStyleInfo,
        getSeekBarStyleFromStorage,
        persistSeekBarStyle,
        shouldShowSeekStyleInfoModal,
        type SeekBarStyle,
    } from "./seekStyle";
    import {
        createTraktScrobbler,
        TRAKT_COMPLETION_THRESHOLD,
    } from "./traktScrobbleManager";
    import { createTorrentStatusPoller } from "./torrentStatusPolling";
    import { performSeekWithEffects } from "./playerSeek";
    import { createNextEpisodeHandler } from "./playerNextEpisode";
    import { createPlayerSessionLoader } from "./playerSessionLoader";
    import { createBrowserPlaybackGuard } from "./browserPlaybackGuard";
    import { readEmbedProgress } from "./embedProgress";
    import { createPlayerModalHandlers } from "./playerModalHandlers";
    import {
        canReuseNextEpisodePrefetch,
        startNextEpisodePrefetch,
        type NextEpisodePrefetchHandoff,
    } from "./nextEpisodePrefetch";
    import type { Chapter } from "./types";
    import {
        LONG_PLAYBACK_STALL_MS,
        recordPlaybackStall,
        shouldSuggestAnotherStream,
        type PlaybackStall,
    } from "./playbackHealth";

    // Props
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
    export let joinPartyId: string | null = null;
    export let autoJoin: boolean = false;
    export let streamAvailability: StreamAvailabilityHint | null = null;

    const imdbID = metaData?.meta?.imdb_id || null;
    const NEXT_EPISODE_PREFETCH_CLICK_GRACE_MS = 750;

    const handleProgressInternal = (time: number, dur: number) => {
        if (onProgress) {
            onProgress(time, dur);
        } else if (imdbID) {
            ProgressLogic.handleProgress(time, dur, imdbID, hasStarted);
        }
    };

    const handleNextEpisodeInternal = async () => {
        if (nextEpisodePrefetchStarting && nextEpisodePrefetchTask) {
            await Promise.race([
                nextEpisodePrefetchTask,
                new Promise<void>((resolve) =>
                    setTimeout(resolve, NEXT_EPISODE_PREFETCH_CLICK_GRACE_MS),
                ),
            ]);
        }
        if (nextEpisodePrefetchResolved) {
            return NavigationLogic.playResolvedNextEpisode(
                nextEpisodePrefetchResolved,
                get(metaProgressMap),
            );
        }
        if (nextEpisodePrefetchStarting) {
            disposeNextEpisodePrefetch();
        }
        if (onNextEpisode) {
            return onNextEpisode();
        }
        if (imdbID) {
            return NavigationLogic.handleNextEpisode(imdbID, get(metaProgressMap));
        }
    };

    let seekBarStyle: SeekBarStyle = "raffi";
    let pendingStartAfterSeekStyleModal = false;
    let introDbChapters: Chapter[] = [];
    let videoSurfaceA: HTMLVideoElement | undefined = undefined;
    let videoSurfaceB: HTMLVideoElement | undefined = undefined;
    let activeVideoSurface: 0 | 1 = 0;
    $: videoElem = (activeVideoSurface === 0 ? videoSurfaceA : videoSurfaceB) as HTMLVideoElement;
    $: nextEpisodePrefetchVideo =
        (activeVideoSurface === 0 ? videoSurfaceB : videoSurfaceA) ?? null;
    let nextEpisodePrefetchDispose: ((opts?: { transfer?: boolean }) => void) | null =
        null;
    let nextEpisodePrefetchHandoff: NextEpisodePrefetchHandoff | null = null;
    let nextEpisodePrefetchResolved: Awaited<ReturnType<typeof NavigationLogic.resolveNextEpisodeStream>> = null;
    let bingeAutoAdvancing = false;
    let nextEpisodePrefetchRunId = 0;
    let nextEpisodePrefetchStarting = false;
    let nextEpisodePrefetchTask: Promise<void> | null = null;
    let nextEpisodePrefetchAbort: AbortController | null = null;
    let nextEpisodePrefetchRetryAt = 0;
    let effectiveChapterMarkers: Chapter[] = [];
    let skipButtonLabel = "Skip Intro";
    let miniPlayerActive = false;
    let lastMiniPlayerActive: boolean | null = null;
    let canEnterMiniPlayer = false;
    let isPlayerRoute = true;
    let loadingBackdropSrc: string | null = null;
    let loadingBackdropMode: "art" | "frame" = "art";
    let availabilityNoticeVisible = false;
    let availabilityBlockedSource: string | null = null;
    let availabilityCheckSource: string | null = null;
    let availabilityCheckRun = 0;

    const getEpisodeLoadingBackdrop = () => {
        if (metaData?.meta?.type !== "series") return null;
        return metaData.meta.videos?.find(
            (video) =>
                video.season === season &&
                (video.episode === episode || video.number === episode),
        )?.thumbnail ?? null;
    };

    const getWindowControls = () =>
        (typeof window !== "undefined" ? (window as any).electronAPI?.windowControls : undefined) as
            | {
                syncMiniPlayerState?: (state: { enabled: boolean; canEnter: boolean }) => void;
                exitMiniPlayer?: () => void;
                isMiniPlayer?: () => Promise<boolean>;
                onMiniPlayerChanged?: (callback: (value: boolean) => void) => (() => void) | void;
            }
            | undefined;

    const handleSeekStyleChange = (style: SeekBarStyle) => {
        seekBarStyle = style;
        persistSeekBarStyle(style);
    };

    const handleSeekStyleAcknowledge = async () => {
        acknowledgeSeekStyleInfo();
        showSeekStyleModal.set(false);

        if (!pendingStartAfterSeekStyleModal) return;
        pendingStartAfterSeekStyleModal = false;

        if (!videoElem) return;
        if ($watchParty.isActive && !$watchParty.isHost) return;
        try {
            await videoElem.play();
        } catch {
        }
    };

    const handleToggleFullscreen = () => {
        controlsManager?.toggleFullscreen?.();
    };

    const handleToggleObjectFit = () => {

        const nextFit: "contain" | "cover" = $objectFit === "contain" ? "cover" : "contain";
        const nextTransform = nextFit === "cover" ? "scale(1.035)" : "none";
        objectFit.set(nextFit);

        if (videoElem) {
            videoElem.style.objectFit = nextFit;
            videoElem.style.objectPosition = "center center";
            videoElem.style.transform = nextTransform;
            videoElem.style.transformOrigin = "center center";
        }

        if (canvasElem) {
            canvasElem.style.objectFit = nextFit;
            canvasElem.style.objectPosition = "center center";
            canvasElem.style.transform = nextTransform;
            canvasElem.style.transformOrigin = "center center";
        }

        if (videoElem && canvasElem) {
            Session.captureFrame(videoElem, canvasElem);

            if (!$showCanvas && !$loading) {
                showCanvas.set(true);
                requestAnimationFrame(() => {
                    if (!$loading) {
                        showCanvas.set(false);
                    }
                });
            }
        }
    };

    const openAudioSelection = () => {
        showAudioSelection.set(true);
    };

    const openSubtitleSelection = () => {
        showSubtitleSelection.set(true);
    };

    const openWatchPartyModal = () => {
        if (embedSrc || $localMode || !$cloudSyncStatus.cloudFeaturesAvailable) {
            showWatchPartyModal.set(false);
            return;
        }
        showWatchPartyModal.set(true);
    };

    const openDesktopDownload = () => {
        const url = "https://raffi.al/#download";
        const electronApi = (window as any).electronAPI as
            | { openExternal?: (target: string) => Promise<void> }
            | undefined;
        if (electronApi?.openExternal) {
            electronApi.openExternal(url).catch(() => {
                window.open(url, "_blank", "noopener,noreferrer");
            });
            return;
        }
        window.open(url, "_blank", "noopener,noreferrer");
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
    const clearBrowserAudioCheck = browserPlaybackGuard.clearAudioCheck;
    const handleVideoError = browserPlaybackGuard.handleVideoError;
    const scheduleBrowserAudioCheck = browserPlaybackGuard.scheduleAudioCheck;

    const handleEmbedMessage = (event: MessageEvent) => {
        if (!embedSrc || !imdbID || !metaData) return;

        const progress = readEmbedProgress(event.data);
        if (!progress) return;

        const nextDuration = progress.duration && progress.duration > 0
            ? progress.duration
            : $duration;
        const now = Date.now();
        if (now - lastEmbedProgressAt < 1000) return;
        lastEmbedProgressAt = now;

        hasStarted = true;
        currentTime.set(progress.time);
        if (nextDuration > 0) {
            duration.set(nextDuration);
            void ProgressLogic.handleProgress(progress.time, nextDuration, imdbID, true);
        }
    };

    const clearEmbedLoadFallback = () => {
        if (!embedLoadFallbackTimeout) return;
        clearTimeout(embedLoadFallbackTimeout);
        embedLoadFallbackTimeout = null;
    };

    const finishEmbedLoad = () => {
        clearEmbedLoadFallback();
        loading.set(false);
        loadingStage.set("");
        loadingDetails.set("");
        loadingProgress.set(null);
    };

    const handleEmbedLoaded = () => {
        finishEmbedLoad();
    };

    let fullscreenCleanupDone = false;

    const exitFullscreenIfNeeded = async () => {
        if (fullscreenCleanupDone) return;
        fullscreenCleanupDone = true;

        try {
            const electronApi = (window as any).electronAPI;
            if (electronApi?.isFullscreen) {
                const isFullscreen = await electronApi.isFullscreen();
                if (isFullscreen) {
                    electronApi.toggleFullscreen?.();
                    return;
                }
            }

            if (typeof document !== "undefined" && document.fullscreenElement) {
                await document.exitFullscreen();
            }
        } catch (error) {
            console.error("Failed to exit fullscreen", error);
        }
    };

    const handleClose = async () => {
        getWindowControls()?.exitMiniPlayer?.();
        if (imdbID) {
            void flushPendingLibraryProgress(imdbID);
        }
        if (hasStarted && !traktScrobbler.isStopSent()) {
            void traktScrobbler.send("stop", true);
        }
        await exitFullscreenIfNeeded();
        await playerSessionLoader.cancelCurrentLoad();
        if (!router.back()) {
            router.navigate("home");
        }
    };

    let playerContainer: HTMLDivElement;
    let canvasElem: HTMLCanvasElement;
    let hls: any = null;
    let playbackController: import("../../lib/media").ClientPlaybackController | null = null;
    let currentVideoSrc: string | null = null;
    let currentEmbedSrc: string | null = null;
    let metadataCheckInterval: any;
    let bufferingActive = false;
    let bufferingStartedAt = 0;
    let bufferingEligibleForHealthPrompt = false;
    let bufferingHealthTimer: ReturnType<typeof setTimeout> | null = null;
    let playbackHealthRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
    let recentPlaybackStalls: PlaybackStall[] = [];
    let playbackHealthPromptVisible = false;
    let playbackHealthPromptDismissed = false;
    let errorModalOpen = false;
    let reprobeAttempted = false;
    let torrentFailureExitTimeout: ReturnType<typeof setTimeout> | null = null;
    let embedLoadFallbackTimeout: ReturnType<typeof setTimeout> | null = null;
    let lastEmbedProgressAt = 0;

    const getTraktMediaType = (): "movie" | "episode" => {
        return metaData?.meta?.type === "series" ? "episode" : "movie";
    };

    const getTraktProgress = (): number => {
        if ($duration <= 0) return 0;
        return Math.max(0, Math.min(100, ($currentTime / $duration) * 100));
    };

    const traktScrobbler = createTraktScrobbler({
        isLocalMode: () => $localMode,
        getImdbId: () => imdbID,
        getHasStarted: () => hasStarted,
        getMediaType: getTraktMediaType,
        getSeasonEpisode: () => ({ season, episode }),
        getProgress: getTraktProgress,
    });

    const computeHasNextEpisode = (): boolean => {
        if (!metaData || metaData.meta?.type !== "series") return false;
        const videos: any[] = Array.isArray((metaData as any).meta?.videos)
            ? ((metaData as any).meta.videos as any[])
            : [];

        if (videos.length === 0) return false;
        if (season == null || episode == null) return true;

        const idx = videos.findIndex(
            (v) => v && v.season === season && v.episode === episode,
        );
        if (idx === -1) return true;
        return idx < videos.length - 1;
    };

    $: hasNextEpisode = computeHasNextEpisode();

    $: bingeNextSupported =
        metaData?.meta?.type === "series" &&
        Boolean($selectedStream?.behaviorHints?.bingeGroup) &&
        !$watchParty.isActive;

    $: nextEpisodePrefetchWindow = Chapters.getNextEpisodePrefetchWindow(
        $duration,
        $sessionData,
        introDbChapters,
    );
    $: nextEpisodePrefetchStartAt = nextEpisodePrefetchWindow.startAt;
    $: nextEpisodeHighlighted = $currentChapter?.kind === "outro";

    $: nowPlayingLabel = (() => {
        const name = metaData?.meta?.name;
        if (!name) return null;
        if (
            metaData?.meta?.type === "series" &&
            season != null &&
            episode != null &&
            Number.isFinite(season) &&
            Number.isFinite(episode)
        ) {
            return `${name} S${season} E${episode}`;
        }
        return name;
    })();

    const disposeNextEpisodePrefetch = (opts?: { transfer?: boolean }) => {
        nextEpisodePrefetchRunId += 1;
        nextEpisodePrefetchStarting = false;
        nextEpisodePrefetchAbort?.abort();
        nextEpisodePrefetchAbort = null;
        nextEpisodePrefetchTask = null;
        nextEpisodePrefetchRetryAt = 0;
        if (nextEpisodePrefetchDispose) {
            nextEpisodePrefetchDispose(opts);
            nextEpisodePrefetchDispose = null;
        }
        nextEpisodePrefetchHandoff = null;
        nextEpisodePrefetchResolved = null;
    };

    const handleTorrentError = (message: string) => {
        if (torrentFailureExitTimeout) {
            clearTimeout(torrentFailureExitTimeout);
            torrentFailureExitTimeout = null;
        }

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
        streamsPopupVisible.set(true);


        torrentFailureExitTimeout = setTimeout(() => {
            showError.set(false);
            handleClose();
            torrentFailureExitTimeout = null;
        }, 1400);
    };

    const torrentStatusPoller = createTorrentStatusPoller({
        onTorrentError: handleTorrentError,
    });

    let playPauseFeedback: { type: "play" | "pause"; id: number } | null = null;
    let playPauseFeedbackTimeout: ReturnType<typeof setTimeout> | null = null;

    const playerSessionLoader = createPlayerSessionLoader({
        getFileIdx: () => fileIdx,
        getStartTime: () => startTime,
        autoPlay,
        getMetaData: () => metaData,
        getSeason: () => season,
        getEpisode: () => episode,
        getVideoElem: () =>
            (activeVideoSurface === 0 ? videoSurfaceA : videoSurfaceB) ?? undefined,
        getHls: () => hls,
        setHls: (value) => {
            hls = value;
        },
        getPlaybackController: () => playbackController,
        setPlaybackController: (value) => {
            playbackController = value;
        },
        getCueLinePercent: () => cueLinePercent,
        shouldShowSeekStyleInfoModal,
        setPendingStartAfterSeekStyleModal: (value) => {
            pendingStartAfterSeekStyleModal = value;
        },
        setHasStarted: (value) => (hasStarted = value),
        setIntroDbChapters: (chapters) => {
            introDbChapters = chapters;
        },
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

            availabilityBlockedSource = videoSrc || source;
            availabilityNoticeVisible = true;
            showError.set(false);
            return true;
        },
        resolvePlaybackStart: async ({ sessionData, startTime, metaData, season, episode }) => {
            let nextIntroDbChapters: Chapter[] = [];

            if (metaData?.meta?.type === "series" && metaData.meta.imdb_id && season != null && episode != null) {
                try {
                    nextIntroDbChapters = await IntroDb.fetchIntroDbChapters(
                        metaData.meta.imdb_id,
                        season,
                        episode,
                    );
                } catch (error) {
                    console.warn("Failed to fetch IntroDB chapters", error);
                }
            }

            const effectiveChapters = Chapters.getEffectiveChapterSegments(
                sessionData,
                nextIntroDbChapters,
            );
            const effectiveStartTime = Chapters.getStartupSkipTarget(
                startTime,
                effectiveChapters,
                $autoSkipIntros,
            );

            return {
                effectiveStartTime,
                introDbChapters: nextIntroDbChapters,
            };
        },
        startTorrentStatusPolling: torrentStatusPoller.start,
        awaitTorrentReady: torrentStatusPoller.waitUntilReady,
        stopTorrentStatusPolling: torrentStatusPoller.stop,
        awaitDomUpdate: tick,
    });

    const loadVideo = playerSessionLoader.loadVideo;

    const seekToTime = (targetTime: number) => {
        if (!videoElem) return;
        captureLoadingBackdrop();
        performSeekWithEffects({
            targetTime,
            duration: $duration,
            playbackOffset: $playbackOffset,
            videoElem,
            captureFrame: () => Session.captureFrame(videoElem, canvasElem),
            onAfterSeek: () => {
                if (!hasStarted) return;
                Discord.updateDiscordActivity(
                    metaData,
                    season,
                    episode,
                    $duration,
                    $currentTime,
                    $isPlaying,
                );
            },
            isWatchPartyHost: $watchParty.isHost,
            isPlaying: $isPlaying,
            updatePlaybackState: WatchParty.updatePlaybackState,
            setPendingSeek: pendingSeek.set,
            setCurrentTime: currentTime.set,
            setShowCanvas: showCanvas.set,
            clientRemuxHardSeek: Boolean(playbackController),
        });
    };

    const triggerPlayPauseFeedback = (type: "play" | "pause") => {
        if (playPauseFeedbackTimeout) clearTimeout(playPauseFeedbackTimeout);
        playPauseFeedback = { type, id: Date.now() };
        playPauseFeedbackTimeout = setTimeout(() => {
            playPauseFeedback = null;
        }, 450);
    };

    const togglePlayWithFeedback = () => {
        if ($watchParty.isActive && !$watchParty.isHost) return;

        if (!videoElem) return;

        if ($showSeekStyleModal) return;

        if (shouldShowSeekStyleInfoModal()) {
            showSeekStyleModal.set(true);
            pendingStartAfterSeekStyleModal = true;
            return;
        }

        triggerPlayPauseFeedback(videoElem.paused ? "play" : "pause");
        controlsManager.togglePlay(controlsVisible.set);
    };

    const togglePlaybackFromMiniPlayer = () => {
        if ($watchParty.isActive && !$watchParty.isHost) return;
        if (!videoElem) return;

        if (videoElem.paused) {
            void videoElem.play();
            return;
        }

        videoElem.pause();
    };

    const captureLoadingBackdrop = () => {
        if (!hasStarted) {
            loadingBackdropSrc = getEpisodeLoadingBackdrop();
            loadingBackdropMode = "art";
            return;
        }

        if (
            videoElem &&
            canvasElem &&
            videoElem.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            videoElem.videoWidth > 0 &&
            videoElem.videoHeight > 0
        ) {
            Session.captureFrame(videoElem, canvasElem);
            if (canvasElem.width > 0 && canvasElem.height > 0) {
                try {
                    loadingBackdropSrc = canvasElem.toDataURL("image/jpeg", 0.72);
                    loadingBackdropMode = "frame";
                    return;
                } catch {
                }
            }
        }

        if (canvasElem && canvasElem.width > 0 && canvasElem.height > 0) {
            try {
                loadingBackdropSrc = canvasElem.toDataURL("image/jpeg", 0.72);
                loadingBackdropMode = "frame";
                return;
            } catch {
            }
        }

        if (loadingBackdropMode === "frame" && loadingBackdropSrc) {
            return;
        }

        loadingBackdropSrc = null;
        loadingBackdropMode = "art";
    };

    $: hasStartedStore.set(hasStarted);

    $: controlsManager = Controls.createControlsManager(
        playerContainer,
        videoElem,
        $watchParty.isActive,
        $watchParty.isHost,
    );

    // When clipping is open, keep controls visible (no idle auto-hide).
    $: if (controlsManager?.setPinned) {
        controlsManager.setPinned(clipPanelOpen, controlsVisible.set);
    }

    onMount(() => {
        resetPlayerState();
        hasStarted = false;
        pendingAutoJoin = Boolean(joinPartyId && autoJoin);

        const windowControls = getWindowControls();
        const removeMiniPlayerChanged =
            windowControls?.onMiniPlayerChanged?.((value: boolean) => {
                miniPlayerActive = Boolean(value);
            }) ?? null;

        void windowControls?.isMiniPlayer?.().then((value) => {
            miniPlayerActive = Boolean(value);
        });

        loadingStage.set("Loading...");
        loadingDetails.set("");
        loadingProgress.set(null);

        seekBarStyle = getSeekBarStyleFromStorage();

        WatchParty.setupWatchPartySync(
            videoElem,
            seekToTime,
            () => $currentTime,
            (val) => {}, // ignorePlayPause setter - handled in sync logic if needed
            (val) => {}, // ignoreSeek setter
        );

        WatchParty.setupPartyEndCallback(
            showPartyEndModal.set,
            partyEndReason.set,
        );

        window.addEventListener("message", handleEmbedMessage);

        metadataCheckInterval = setInterval(() => {
            if (!videoElem) return;

            const currentTime = videoElem.currentTime;
            const durationVal = videoElem.duration;

            if (
                currentTime > 2 &&
                !videoElem.paused &&
                (isNaN(durationVal) || durationVal === 0)
            ) {
                if (!reprobeAttempted) {
                    reprobeAttempted = true;
                    reloadSession();
                } else if (currentTime > 10) {
                    showError.set(true);
                    errorMessage.set("Stream Error");
                    errorDetails.set(
                        "Metadata missing. Please select another stream.",
                    );
                    videoElem.pause();
                    clearInterval(metadataCheckInterval);
                }
            }
        }, 1000);

        return () => {
            if (typeof removeMiniPlayerChanged === "function") {
                removeMiniPlayerChanged();
            }
            window.removeEventListener("message", handleEmbedMessage);
        };
    });

    onDestroy(() => {
        availabilityCheckRun += 1;
        getWindowControls()?.syncMiniPlayerState?.({
            enabled: false,
            canEnter: false,
        });
        getWindowControls()?.exitMiniPlayer?.();
        if (imdbID) {
            void flushPendingLibraryProgress(imdbID);
        }
        if (hasStarted && !traktScrobbler.isStopSent()) {
            void traktScrobbler.send("stop", true);
        }
        void exitFullscreenIfNeeded();
        clearInterval(metadataCheckInterval);
        torrentStatusPoller.stop();
        if (playPauseFeedbackTimeout) clearTimeout(playPauseFeedbackTimeout);
        if (torrentFailureExitTimeout) clearTimeout(torrentFailureExitTimeout);
        if (bufferingHealthTimer) clearTimeout(bufferingHealthTimer);
        if (playbackHealthRecoveryTimer) clearTimeout(playbackHealthRecoveryTimer);
        clearEmbedLoadFallback();
        clearBrowserAudioCheck();
        playerSessionLoader.cancelCurrentLoad();
        Subtitles.releaseUploadedSubtitleUrls();
        disposeNextEpisodePrefetch();
        if (playbackController) {
            void playbackController.destroy();
            playbackController = null;
        }
        Session.cleanupSession(
            hls,
            Discord.clearDiscordActivity,
            WatchParty.leaveWatchParty,
            $watchParty.isActive,
            videoElem,
        );
        resetPlayerState();
        hasStarted = false;
    });

    const handleTimeUpdate = () => {
        if (!videoElem) return;
        if ($pendingSeek != null || $seekGuard) {
            return;
        }
        const time = $playbackOffset + videoElem.currentTime;
        currentTime.set(time);
        handleProgressInternal(time, $duration);

        if (
            !traktScrobbler.isStopSent() &&
            $duration > 0 &&
            time / $duration >= TRAKT_COMPLETION_THRESHOLD
        ) {
            void traktScrobbler.send("stop", true);
        }

        if (!$seekGuard) {
            const result = Chapters.checkChapters(
                time,
                $sessionData,
                $duration,
                metaData,
                introDbChapters,
            );
            currentChapter.set(result.currentChapter);
            showSkipIntro.set(result.showSkipIntro);
            showNextEpisode.set(result.showNextEpisode);
            skipButtonLabel = result.skipButtonLabel;

            if (bingeNextSupported) {
                const bingeChapter = result.currentChapter;
                if (Chapters.shouldAutoSkipChapter(bingeChapter, $autoSkipIntros)) {
                    seekToTime(bingeChapter.endTime + 0.1);
                    return;
                }

                const hasOutro = Chapters.hasMarkedOutroChapter(
                    $sessionData,
                    introDbChapters,
                );
                let shouldAutoNext = false;
                if (hasOutro && result.currentChapter?.kind === "outro") {
                    const t = Chapters.getBingeOutroAutoNextThreshold(
                        result.currentChapter,
                    );
                    shouldAutoNext = t != null && time >= t;
                } else if (!hasOutro && $duration > 0) {
                    shouldAutoNext = time >= $duration - 3;
                }
                if (shouldAutoNext && !bingeAutoAdvancing) {
                    bingeAutoAdvancing = true;
                    handleNextEpisodeClick();
                    return;
                }

            }

            if (
                imdbID &&
                hasNextEpisode &&
                !$watchParty.isActive &&
                !nextEpisodePrefetchDispose &&
                !nextEpisodePrefetchStarting &&
                !nextEpisodePrefetchResolved &&
                Date.now() >= nextEpisodePrefetchRetryAt &&
                nextEpisodePrefetchWindow.creditsAt > 0 &&
                nextEpisodePrefetchStartAt < nextEpisodePrefetchWindow.creditsAt &&
                time >= nextEpisodePrefetchStartAt
            ) {
                nextEpisodePrefetchStarting = true;
                const runId = ++nextEpisodePrefetchRunId;
                const prefetchAbort = new AbortController();
                nextEpisodePrefetchAbort = prefetchAbort;
                nextEpisodePrefetchTask = (async () => {
                    try {
                        const resolved = await NavigationLogic.resolveNextEpisodeStream(imdbID);
                        if (runId !== nextEpisodePrefetchRunId) return;
                        if (!nextEpisodePrefetchVideo || !resolved) {
                            nextEpisodePrefetchRetryAt = Date.now() + 10_000;
                            return;
                        }
                        const playable = streamToPlayableUrl(resolved.stream);
                        if (!playable) {
                            nextEpisodePrefetchRetryAt = Date.now() + 10_000;
                            return;
                        }
                        const { dispose, handoff } = await startNextEpisodePrefetch(
                            playable.url,
                            playable.fileIdx,
                            nextEpisodePrefetchVideo,
                            () => {},
                            prefetchAbort.signal,
                        );
                        if (runId !== nextEpisodePrefetchRunId) {
                            dispose?.();
                            return;
                        }
                        if (!dispose || !handoff) {
                            nextEpisodePrefetchRetryAt = Date.now() + 10_000;
                            return;
                        }
                        nextEpisodePrefetchDispose = dispose;
                        nextEpisodePrefetchHandoff = handoff;
                        nextEpisodePrefetchResolved = resolved;
                    } catch (error) {
                        if (runId === nextEpisodePrefetchRunId) {
                            nextEpisodePrefetchResolved = null;
                            nextEpisodePrefetchHandoff = null;
                        }
                        if (!(error instanceof DOMException && error.name === "AbortError")) {
                            console.warn("Next episode prefetch attempt failed", error);
                            nextEpisodePrefetchRetryAt = Date.now() + 10_000;
                        }
                    } finally {
                        if (runId === nextEpisodePrefetchRunId) {
                            nextEpisodePrefetchStarting = false;
                            nextEpisodePrefetchAbort = null;
                            nextEpisodePrefetchTask = null;
                        }
                    }
                })();
            }
        }
    };

    const handlePlay = () => {
        torrentStatusPoller.stop();
        isPlaying.set(true);
    };

    const handlePlaying = () => {
        torrentStatusPoller.stop();
        isPlaying.set(true);
        hasStarted = true;
        void traktScrobbler.send("start");
        Discord.updateDiscordActivity(
            metaData,
            season,
            episode,
            $duration,
            $currentTime,
            true,
        );
        if ($watchParty.isHost) {
            WatchParty.updatePlaybackState($currentTime, true);
        }
        playbackBuffering.set(false);
        loading.set(false);
        loadingStage.set("");
        loadingDetails.set("");
        loadingProgress.set(null);
        handleBufferEnd();
        scheduleBrowserAudioCheck();
    };

    const handlePause = () => {
        // Hard seeks pause the element on purpose while remux/HLS rebuilds —
        // don't treat that as a user pause (Trakt / Discord / watch party).
        if (get(seekGuard) || get(pendingSeek) != null) {
            return;
        }
        if (!hasStarted) {
            Discord.clearDiscordActivity();
            return;
        }
        isPlaying.set(false);
        if (
            !traktScrobbler.isStopSent() &&
            !(
                $duration > 0 &&
                $currentTime / $duration >= TRAKT_COMPLETION_THRESHOLD
            )
        ) {
            void traktScrobbler.send("pause");
        }
        Discord.updateDiscordActivity(
            metaData,
            season,
            episode,
            $duration,
            $currentTime,
            false,
        );
        if ($watchParty.isHost) {
            WatchParty.updatePlaybackState($currentTime, false);
        }
    };

    const handleBufferStart = () => {
        if (bufferingActive) return;
        bufferingActive = true;
        bufferingStartedAt = Date.now();
        if (playbackHealthRecoveryTimer) {
            clearTimeout(playbackHealthRecoveryTimer);
            playbackHealthRecoveryTimer = null;
        }
        bufferingEligibleForHealthPrompt =
            hasStarted && !get(seekGuard) && get(pendingSeek) == null;
        if (
            bufferingEligibleForHealthPrompt &&
            !playbackHealthPromptVisible &&
            !playbackHealthPromptDismissed
        ) {
            if (bufferingHealthTimer) clearTimeout(bufferingHealthTimer);
            bufferingHealthTimer = setTimeout(() => {
                if (
                    bufferingActive &&
                    bufferingEligibleForHealthPrompt &&
                    !playbackHealthPromptDismissed
                ) {
                    playbackHealthPromptVisible = true;
                }
            }, LONG_PLAYBACK_STALL_MS);
        }
    };

    const handleBufferEnd = () => {
        if (!bufferingActive) return;
        bufferingActive = false;
        if (bufferingHealthTimer) {
            clearTimeout(bufferingHealthTimer);
            bufferingHealthTimer = null;
        }
        const durationMs = Date.now() - bufferingStartedAt;
        if (
            bufferingEligibleForHealthPrompt &&
            !get(seekGuard) &&
            get(pendingSeek) == null
        ) {
            recentPlaybackStalls = recordPlaybackStall(
                recentPlaybackStalls,
                durationMs,
            );
            if (
                !playbackHealthPromptDismissed &&
                !playbackHealthPromptVisible &&
                shouldSuggestAnotherStream(recentPlaybackStalls)
            ) {
                playbackHealthPromptVisible = true;
            }
        }
        bufferingEligibleForHealthPrompt = false;
        if (playbackHealthPromptVisible) {
            playbackHealthRecoveryTimer = setTimeout(() => {
                playbackHealthRecoveryTimer = null;
                if (bufferingActive || !playbackHealthPromptVisible) return;
                playbackHealthPromptVisible = false;
                recentPlaybackStalls = [];
            }, 15_000);
        }
    };

    const dismissPlaybackHealthPrompt = () => {
        if (playbackHealthRecoveryTimer) {
            clearTimeout(playbackHealthRecoveryTimer);
            playbackHealthRecoveryTimer = null;
        }
        playbackHealthPromptVisible = false;
        playbackHealthPromptDismissed = true;
    };

    const chooseAnotherStreamForPlaybackHealth = () => {
        if (playbackHealthRecoveryTimer) {
            clearTimeout(playbackHealthRecoveryTimer);
            playbackHealthRecoveryTimer = null;
        }
        playbackHealthPromptVisible = false;
        playbackHealthPromptDismissed = true;
        returnToStreams();
    };

    const reloadSession = () => {
        if (!currentVideoSrc) return;

        playerSessionLoader.cancelCurrentLoad();
        Session.cleanupSession(
            hls,
            Discord.clearDiscordActivity,
            WatchParty.leaveWatchParty,
            $watchParty.isActive,
            videoElem,
        );
        loadVideo(currentVideoSrc);
    };

    $: if ($showError && !errorModalOpen) {
        Discord.clearDiscordActivity();
        loading.set(false);
        loadingStage.set("");
        loadingDetails.set("");
        loadingProgress.set(null);
        playbackBuffering.set(false);
        errorModalOpen = true;
    }

    $: if (!$showError && errorModalOpen) {
        errorModalOpen = false;
    }

    $: if (availabilityNoticeVisible) {
        Discord.clearDiscordActivity();
    }

    const showActionLoading = (actionLabel: string, err: unknown) => {
        bingeAutoAdvancing = false;
        loading.set(false);
        showError.set(true);
        errorMessage.set(actionLabel);
        errorDetails.set(err instanceof Error ? err.message : String(err));
    };

    const handleSkipIntro = () => {
        Chapters.skipChapter($currentChapter, seekToTime);
    };

    const handleNextEpisodeClick = createNextEpisodeHandler({
        handleProgressInternal,
        getVideoSrc: () => videoSrc,
        setCurrentVideoSrc: (value) => {
            currentVideoSrc = value;
        },
        invokeNextEpisode: handleNextEpisodeInternal,
        showActionLoading,
        suppressInitialLoading: () => nextEpisodePrefetchHandoff != null,
        onNextEpisodeFailed: () => {
            bingeAutoAdvancing = false;
        },
    });

    const handleEnded = () => {
        if (hasStarted && !traktScrobbler.isStopSent()) {
            void traktScrobbler.send("stop", true);
        }
        if (bingeNextSupported && hasNextEpisode && !bingeAutoAdvancing) {
            bingeAutoAdvancing = true;
            handleNextEpisodeClick();
        }
    };

    const modalHandlers = createPlayerModalHandlers({
        getVideoElem: () =>
            (activeVideoSurface === 0 ? videoSurfaceA : videoSurfaceB) ?? undefined,
        getCueLinePercent: () => cueLinePercent,
        getVideoSrc: () => videoSrc,
        loadVideo: (src) => {
            if (src === currentVideoSrc) {
                reloadSession();
                return;
            }
            return loadVideo(src);
        },
        handleClose,
        getPlaybackController: () => playbackController,
    });

    let controlsOverlayElem: HTMLElement | null = null;
    let clipPanelOpen = false;
    let cueLinePercent = 92;
    let resizeCounter = 0;
    let cueRecalcTimeout: number | null = null;
    let lastControlsVisible: boolean | null = null;
    let pendingAutoJoin = false;

    const SUBTITLE_CONTROLS_MARGIN_PX = 26;

    const recomputeCueLinePercent = () => {
        cueLinePercent = Subtitles.computeCueLinePercent(
            playerContainer,
            controlsOverlayElem,
            $controlsVisible,
            SUBTITLE_CONTROLS_MARGIN_PX,
        );
        Subtitles.updateCuePositions(videoElem, cueLinePercent);
    };

    $: if (embedSrc && embedSrc !== currentEmbedSrc) {
        currentEmbedSrc = embedSrc;
        currentVideoSrc = embedSrc;
        introDbChapters = [];
        effectiveChapterMarkers = [];
        skipButtonLabel = "Skip Intro";
        hasStarted = false;
        bingeAutoAdvancing = false;
        lastEmbedProgressAt = 0;
        playerSessionLoader.cancelCurrentLoad();
        disposeNextEpisodePrefetch();
        handleNextEpisodeClick.cancel();
        Session.cleanupSession(
            hls,
            Discord.clearDiscordActivity,
            WatchParty.leaveWatchParty,
            $watchParty.isActive,
            videoElem,
        );
        hls = null;
        loading.set(true);
        loadingStage.set("Loading embedded player");
        loadingDetails.set("");
        loadingProgress.set(null);
        showError.set(false);
        clearEmbedLoadFallback();
        embedLoadFallbackTimeout = setTimeout(finishEmbedLoad, 1200);
    }

    const transitionToVideoSource = (nextVideoSrc: string) => {
        clearEmbedLoadFallback();
        currentEmbedSrc = null;
        introDbChapters = [];
        effectiveChapterMarkers = [];
        skipButtonLabel = "Skip Intro";
        currentVideoSrc = nextVideoSrc;
        hasStarted = false;
        bingeAutoAdvancing = false;
        recentPlaybackStalls = [];
        playbackHealthPromptVisible = false;
        playbackHealthPromptDismissed = false;
        bufferingEligibleForHealthPrompt = false;
        if (bufferingHealthTimer) {
            clearTimeout(bufferingHealthTimer);
            bufferingHealthTimer = null;
        }
        if (playbackHealthRecoveryTimer) {
            clearTimeout(playbackHealthRecoveryTimer);
            playbackHealthRecoveryTimer = null;
        }

        const handoff = nextEpisodePrefetchHandoff;
        const canReuseHandoff = canReuseNextEpisodePrefetch(
            handoff,
            nextVideoSrc,
            fileIdx,
            startTime,
        );

        const previousController = playbackController;
        const previousHls = hls;

        if (canReuseHandoff) {
            // Keep MediaSource on the same element by flipping which surface is visible.
            activeVideoSurface = activeVideoSurface === 0 ? 1 : 0;
        }

        const reuseSession = canReuseHandoff
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
        disposeNextEpisodePrefetch(reuseSession ? { transfer: true } : undefined);

        if (reuseSession?.playbackController) {
            playbackController = reuseSession.playbackController;
        } else if (!canReuseHandoff) {
            playbackController = null;
        }

        if (previousHls && previousHls !== reuseSession?.hls) {
            try {
                previousHls.destroy();
            } catch {
                // ignore
            }
        }
        if (reuseSession?.hls) {
            hls = reuseSession.hls;
        } else if (!canReuseHandoff) {
            hls = null;
        }

        // Clear the previous episode off the now-idle surface.
        const idleVideo =
            activeVideoSurface === 0 ? videoSurfaceB : videoSurfaceA;
        if (canReuseHandoff && idleVideo && !previousController) {
            try {
                idleVideo.pause();
                idleVideo.removeAttribute("src");
                idleVideo.load();
            } catch {
                // ignore
            }
        }

        Session.cleanupSession(
            null,
            Discord.clearDiscordActivity,
            WatchParty.leaveWatchParty,
            $watchParty.isActive,
            canReuseHandoff ? null : videoElem,
        );
        loadVideo(nextVideoSrc, reuseSession ? { reuseSession } : undefined);
    };

    const shouldPreflightSource = (source: string) =>
        Boolean(
            streamAvailability &&
            /^https?:\/\//i.test(source) &&
            $selectedStream?.raffiSource !== "local" &&
            $selectedStream?.raffiSource !== "direct" &&
            $selectedStream?.directPlaybackMode !== "iframe",
        );

    const prepareVideoSource = async (nextVideoSrc: string) => {
        if (
            nextVideoSrc === currentVideoSrc ||
            nextVideoSrc === availabilityCheckSource ||
            nextVideoSrc === availabilityBlockedSource
        ) return;

        if (!shouldPreflightSource(nextVideoSrc)) {
            transitionToVideoSource(nextVideoSrc);
            return;
        }

        const run = ++availabilityCheckRun;
        availabilityCheckSource = nextVideoSrc;
        availabilityNoticeVisible = false;
        showError.set(false);
        errorMessage.set("");
        errorDetails.set("");
        loadingBackdropSrc = getEpisodeLoadingBackdrop();
        loadingBackdropMode = "art";
        loading.set(true);
        loadingStage.set("Checking availability");
        loadingDetails.set("Verifying that this source can start immediately.");
        loadingProgress.set(null);

        const result = await preflightStreamUrl(nextVideoSrc);
        if (run !== availabilityCheckRun || videoSrc !== nextVideoSrc) return;
        availabilityCheckSource = null;

        if (result.state === "network-error") {
            availabilityBlockedSource = nextVideoSrc;
            errorMessage.set("Stream connection failed");
            errorDetails.set(
                "Raffi couldn't reach this stream. It may be blocked by your network, carrier, ISP, or DNS provider. Try changing DNS, switching networks, or using a VPN.",
            );
            showError.set(true);
            loading.set(false);
            return;
        }

        const looksLikeStatusMedia =
            result.state === "ready" &&
            isLikelyProviderStatusMedia({
                expectedSizeBytes: streamAvailability?.expectedSizeBytes ?? null,
                actualSizeBytes: result.totalBytes,
            });

        if (
            looksLikeStatusMedia ||
            isStreamPreparationPending(result, streamAvailability?.cacheHint ?? null)
        ) {
            availabilityBlockedSource = nextVideoSrc;
            availabilityNoticeVisible = true;
            loading.set(false);
            return;
        }

        transitionToVideoSource(nextVideoSrc);
    };

    const retryInitialSource = () => {
        if (
            videoSrc &&
            availabilityBlockedSource === videoSrc &&
            currentVideoSrc !== videoSrc
        ) {
            availabilityBlockedSource = null;
            showError.set(false);
            void prepareVideoSource(videoSrc);
            return;
        }
        modalHandlers.onErrorRetry();
    };

    const returnToStreams = () => {
        streamsPopupVisible.set(true);
        void handleClose();
    };

    const openAvailabilityDashboard = () => {
        const url = streamAvailability?.dashboardUrl;
        if (!url || typeof window === "undefined") return;
        const electronApi = (window as any).electronAPI as
            | { openExternal?: (target: string) => Promise<void> }
            | undefined;
        if (electronApi?.openExternal) {
            void electronApi.openExternal(url).catch(() => {
                window.open(url, "_blank", "noopener,noreferrer");
            });
            return;
        }
        window.open(url, "_blank", "noopener,noreferrer");
    };

    $: if (
        videoSrc &&
        videoSrc !== currentVideoSrc &&
        videoSrc !== availabilityCheckSource &&
        videoSrc !== availabilityBlockedSource
    ) {
        void prepareVideoSource(videoSrc);
    }

    $: effectiveChapterMarkers = Chapters.getEffectiveChapterSegments($sessionData, introDbChapters);

    $: if (videoElem) {
        videoElem.muted = false;
    }

    $: if ($loading && !hasStarted) {
        loadingBackdropSrc = getEpisodeLoadingBackdrop();
        loadingBackdropMode = "art";
    }

    $: isPlayerRoute = $router.page === "player";

    $: canEnterMiniPlayer = Boolean(
        isPlayerRoute &&
        $miniPlayerOnMinimize &&
        videoSrc &&
        !$showError &&
        ($isPlaying || miniPlayerActive),
    );

    $: getWindowControls()?.syncMiniPlayerState?.({
        enabled: $miniPlayerOnMinimize && isPlayerRoute,
        canEnter: canEnterMiniPlayer,
    });

    $: if (miniPlayerActive && !canEnterMiniPlayer) {
        getWindowControls()?.exitMiniPlayer?.();
    }

    $: if (lastMiniPlayerActive !== miniPlayerActive) {
        lastMiniPlayerActive = miniPlayerActive;
        resizeCounter += 1;
    }

    $: if (pendingAutoJoin && joinPartyId && autoJoin && !$localMode && $cloudSyncStatus.cloudFeaturesAvailable) {
        showWatchPartyModal.set(true);
        pendingAutoJoin = false;
    }

    $: if ($showWatchPartyModal && (embedSrc || !$cloudSyncStatus.cloudFeaturesAvailable)) {
        showWatchPartyModal.set(false);
    }

    $: {
        resizeCounter;
        cueLinePercent = Subtitles.computeCueLinePercent(
            playerContainer,
            controlsOverlayElem,
            $controlsVisible,
            SUBTITLE_CONTROLS_MARGIN_PX,
        );
    }
    $: Subtitles.updateCuePositions(videoElem, cueLinePercent);

    $: if (typeof window !== "undefined") {
        if (lastControlsVisible !== $controlsVisible) {
            lastControlsVisible = $controlsVisible;

            // Instant update on toggle.
            recomputeCueLinePercent();

            // Follow up during the transition/layout settling.
            window.requestAnimationFrame(() => recomputeCueLinePercent());
            window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => recomputeCueLinePercent());
            });

            if (cueRecalcTimeout != null) {
                window.clearTimeout(cueRecalcTimeout);
            }
            cueRecalcTimeout = window.setTimeout(recomputeCueLinePercent, 350);
        }
    }
</script>

<svelte:window
    on:mousemove={() => controlsManager.handleMouseMove(controlsVisible.set)}
    on:resize={() => {
        resizeCounter += 1;
    }}
    on:keydown={(e) =>
        controlsManager.handleKeydown(
            e,
            $currentTime,
            $duration,
            $volume,
            seekToTime,
            volume.set,
            seekFeedback.set,
            togglePlayWithFeedback,
        )}
/>

<div
    class="fixed inset-0 w-full h-full bg-black overflow-hidden group z-100 {$controlsVisible
        ? 'cursor-default'
        : 'cursor-none'}"
    bind:this={playerContainer}
    role="presentation"
>
    <div class="w-full h-full">
        {#if embedSrc}
            <iframe
                src={embedSrc}
                title={metaData?.meta?.name || "Embedded player"}
                class="h-full w-full bg-black {$controlsVisible ? 'pointer-events-auto' : 'pointer-events-none'}"
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                allowfullscreen
                referrerpolicy="no-referrer"
                on:load={handleEmbedLoaded}
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
                on:play={handlePlay}
                on:pause={handlePause}
                on:ended={handleEnded}
                on:click={() => {
                    if (!miniPlayerActive) {
                        togglePlayWithFeedback();
                    }
                }}
                on:waiting={() => {
                    if (hasStarted) {
                        playbackBuffering.set(true);
                    } else {
                        captureLoadingBackdrop();
                        loading.set(true);
                        loadingStage.set("Buffering");
                    }
                    handleBufferStart();
                }}
                on:playing={handlePlaying}
                on:canplay={() => {
                    playbackBuffering.set(false);
                    loading.set(false);
                    handleBufferEnd();
                }}
                on:error={handleVideoError}
            />
        {/if}
    </div>

    {#if playPauseFeedback && !embedSrc}
        <PlayPauseFeedback
            type={playPauseFeedback.type}
            id={playPauseFeedback.id}
        />
    {/if}

    {#if miniPlayerActive && !embedSrc}
        <MiniPlayerControls
            currentTime={$currentTime}
            duration={$duration}
            pendingSeek={$pendingSeek}
            loading={$loading}
            isPlaying={$isPlaying}
            {seekBarStyle}
            onTogglePlayback={togglePlaybackFromMiniPlayer}
            onSeekInput={(e) =>
                controlsManager.onSeekInput(e, $duration, pendingSeek.set)}
            onSeekChange={(e) =>
                controlsManager.onSeekChange(e, $duration, seekToTime)}
        />
    {/if}

    {#if $seekFeedback && !embedSrc}
        <SeekFeedback
            type={$seekFeedback.type}
            seekBarStyle={seekBarStyle}
            id={$seekFeedback.id}
        />
    {/if}

    <PlayerLoadingScreen
        loading={$loading && !miniPlayerActive}
        onClose={handleClose}
        {metaData}
        backdropSrc={loadingBackdropSrc}
        backdropMode={loadingBackdropMode}
        stage={$loadingStage}
        details={$loadingDetails}
        progress={$loadingProgress}
        showError={$showError && !hasStarted && !miniPlayerActive}
        errorMessage={$errorMessage}
        errorDetails={$errorDetails}
        onRetry={retryInitialSource}
        onBack={modalHandlers.onErrorBack}
        onDownloadDesktop={openDesktopDownload}
        showNotice={availabilityNoticeVisible && !miniPlayerActive}
        noticeTitle="Not available on demand"
        noticeDetails={`This stream is not ready yet. ${streamAvailability?.providerLabel || "Your debrid provider"} has started preparing it, which can take a while and sometimes days. Check your provider dashboard for progress, then try this source again once it is cached.`}
        noticePrimaryLabel="Back to Streams"
        noticeSecondaryLabel={streamAvailability?.dashboardUrl ? "Open Dashboard" : ""}
        onNoticePrimary={returnToStreams}
        onNoticeSecondary={openAvailabilityDashboard}
        showSeekStyle={$showSeekStyleModal && !hasStarted && !miniPlayerActive}
        {seekBarStyle}
        onSeekStyleChange={handleSeekStyleChange}
        onSeekStyleAcknowledge={handleSeekStyleAcknowledge}
    />

    {#if $playbackBuffering && !$loading && !miniPlayerActive && !embedSrc}
        <div class="pointer-events-none absolute inset-0 z-40 flex items-center justify-center" aria-label="Buffering">
            <LoadingSpinner size="56px" />
        </div>
    {/if}

    {#if !$loading && !miniPlayerActive}
        <div
            class="absolute left-0 top-0 p-4 sm:p-10 z-50 transition-all duration-300 ease-in-out transform {$controlsVisible
                ? 'translate-y-0 opacity-100'
                : '-translate-y-10 opacity-0 pointer-events-none'} will-change-transform will-change-opacity"
        >
            <button
                class="player-nav-button bg-[#000000]/20 backdrop-blur-md hover:bg-[#FFFFFF]/20 transition-colors duration-200 rounded-full cursor-pointer"
                on:click={handleClose}
                aria-label="Close player"
            >
                <ChevronLeft size={26} color="white" strokeWidth={2} />
            </button>
        </div>

        {#if metaData?.meta?.type === "series" && hasNextEpisode && !(!$localMode && $watchParty.isActive && !$watchParty.isHost)}
            <div
                class="absolute right-0 top-0 p-4 sm:p-10 z-50 transition-all duration-300 ease-in-out transform {nextEpisodeHighlighted || $controlsVisible
                    ? 'translate-y-0 opacity-100'
                    : '-translate-y-10 opacity-0 pointer-events-none'} will-change-transform will-change-opacity"
            >
                <button
                    class="player-nav-button backdrop-blur-md transition-all duration-200 rounded-full cursor-pointer {nextEpisodeHighlighted
                        ? 'bg-white shadow-[0_0_0_4px_rgba(255,255,255,0.22),0_0_32px_rgba(255,255,255,0.5)] scale-105'
                        : 'bg-[#000000]/20 hover:bg-[#FFFFFF]/20'}"
                    on:click={handleNextEpisodeClick}
                    aria-label="Next episode"
                    title={nextEpisodeHighlighted ? "Next Episode — Outro" : "Next Episode"}
                >
                    <SkipForward size={26} color={nextEpisodeHighlighted ? "black" : "white"} strokeWidth={2} />
                </button>
            </div>
        {/if}

        {#if nowPlayingLabel}
            <div
                class="absolute top-4 inset-x-24 sm:top-10 sm:inset-x-28 z-50 flex h-[62px] items-center justify-center pointer-events-none select-none transition-all duration-300 ease-in-out transform {$controlsVisible
                    ? 'translate-y-0 opacity-100'
                    : '-translate-y-10 opacity-0'} will-change-transform will-change-opacity"
            >
                <span
                    class="inline-flex min-h-[clamp(48px,3.23vw,62px)] max-w-full items-center truncate rounded-full bg-[#000000]/20 p-4 text-[1rem] leading-6 font-medium text-white backdrop-blur-md transition-colors duration-200 sm:max-w-[40rem] sm:px-8 sm:text-[1.125rem] {$controlsVisible
                        ? 'pointer-events-auto'
                        : 'pointer-events-none'}"
                    title={nowPlayingLabel}
                >
                    {nowPlayingLabel}
                </span>
            </div>
        {/if}

        {#if !embedSrc}
            <div
            class="player-controls-dock absolute left-1/2 -translate-x-1/2 z-50 flex max-w-full flex-col gap-2.5"
            >
                <PlayerOverlays
                    showSkipIntro={$showSkipIntro}
                    isWatchPartyMember={!$localMode && $watchParty.isActive && !$watchParty.isHost}
                    skipLabel={skipButtonLabel}
                    skipChapter={handleSkipIntro}
                    showPlaybackHealthPrompt={playbackHealthPromptVisible}
                    chooseAnotherStream={chooseAnotherStreamForPlaybackHealth}
                    keepWatching={dismissPlaybackHealthPrompt}
                />

                <div
                    class="transition-all duration-300 ease-in-out transform {$controlsVisible
                        ? 'translate-y-0 opacity-100'
                        : 'translate-y-10 opacity-0 pointer-events-none'} will-change-transform will-change-opacity"
                    bind:this={controlsOverlayElem}
                >
                    <PlayerControls
                        isPlaying={$isPlaying}
                        duration={$duration}
                        currentTime={$currentTime}
                        pendingSeek={$pendingSeek}
                        volume={$volume}
                        {seekBarStyle}
                        chapterMarkers={effectiveChapterMarkers}
                        {videoSrc}
                        {metaData}
                        currentAudioLabel={$currentAudioLabel}
                        currentSubtitleLabel={$currentSubtitleLabel}
                        isWatchPartyMember={!$localMode && $watchParty.isActive && !$watchParty.isHost}
                        togglePlay={togglePlayWithFeedback}
                        onSeekInput={(e) =>
                            controlsManager.onSeekInput(e, $duration, pendingSeek.set)}
                        onSeekChange={(e) =>
                            controlsManager.onSeekChange(e, $duration, seekToTime)}
                        onVolumeChange={(e) => controlsManager.onVolumeChange(e, volume.set)}
                        toggleFullscreen={handleToggleFullscreen}
                        objectFit={$objectFit}
                        toggleObjectFit={handleToggleObjectFit}
                        showWatchParty={!$localMode && $cloudSyncStatus.cloudFeaturesAvailable && !embedSrc}
                        onAudioClick={openAudioSelection}
                        onSubtitleClick={openSubtitleSelection}
                        onWatchPartyClick={() => {
                            if (!$localMode && $cloudSyncStatus.cloudFeaturesAvailable && !embedSrc) {
                                openWatchPartyModal();
                            } else {
                                showWatchPartyModal.set(false);
                            }
                        }}
                        onClipPanelOpenChange={(detail) => {
                            clipPanelOpen = !!detail?.open;
                            controlsManager?.setPinned?.(clipPanelOpen, controlsVisible.set);
                        }}
                    />
                </div>
            </div>
        {/if}
    {/if}

    <PlayerModals
        showAudioSelection={$showAudioSelection}
        showSubtitleSelection={$showSubtitleSelection}
        showError={$showError && (hasStarted || miniPlayerActive)}
        showWatchPartyModal={$showWatchPartyModal && !$localMode && $cloudSyncStatus.cloudFeaturesAvailable && !embedSrc}
        showSeekStyleModal={$showSeekStyleModal && (hasStarted || miniPlayerActive)}
        audioTracks={$audioTracks}
        subtitleTracks={$subtitleTracks}
        errorMessage={$errorMessage}
        errorDetails={$errorDetails}
        {seekBarStyle}
        {metaData}
        {season}
        {episode}
        videoSrc={videoSrc || embedSrc}
        {fileIdx}
        onSeekStyleChange={handleSeekStyleChange}
        onSeekStyleAcknowledge={handleSeekStyleAcknowledge}
        onAudioSelect={modalHandlers.onAudioSelect}
        onSubtitleSelect={modalHandlers.onSubtitleSelect}
        onSubtitleUpload={modalHandlers.onSubtitleUpload}
        onSubtitleDelayChange={modalHandlers.onSubtitleDelayChange}
        onErrorRetry={modalHandlers.onErrorRetry}
        onErrorBack={modalHandlers.onErrorBack}
        onDownloadDesktop={openDesktopDownload}
        onCloseAudio={modalHandlers.onCloseAudio}
        onCloseSubtitle={modalHandlers.onCloseSubtitle}
        onCloseWatchParty={modalHandlers.onCloseWatchParty}
        initialPartyCode={joinPartyId}
        autoJoin={autoJoin}
        onFileSelected={modalHandlers.onFileSelected}
    />

    <PlayerWatchParty
        showPartyEndModal={$showPartyEndModal}
        partyEndReason={$partyEndReason}
        onContinue={() => showPartyEndModal.set(false)}
        onLeave={() => {
            showPartyEndModal.set(false);
            void handleClose();
        }}
    />
</div>

<style>
    .player-controls-dock {
        bottom: clamp(14px, 4.5vh, 50px);
    }

    .player-nav-button {
        display: grid;
        width: clamp(44px, 3.2vw, 54px);
        height: clamp(44px, 3.2vw, 54px);
        place-items: center;
    }

    .player-nav-button :global(svg) {
        width: clamp(21px, 1.55vw, 26px);
        height: clamp(21px, 1.55vw, 26px);
    }

    @media (orientation: portrait), (max-height: 620px) {
        .player-controls-dock {
            bottom: 10px;
        }
    }
</style>
