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
    import type { ShowResponse } from "../../lib/library/types/meta_types";
    import { watchParty } from "../../lib/stores/watchPartyStore";
    import { localMode } from "../../lib/stores/authStore";
    import { cloudSyncStatus, flushPendingLibraryProgress } from "../../lib/db/db";
    import { trackEvent } from "../../lib/analytics";
    import {
        autoSkipIntros,
        miniPlayerOnMinimize,
    } from "../../lib/stores/playbackPreferences";
    import { ChevronLeft } from "@lucide/svelte";
    import * as NavigationLogic from "../meta/navigationLogic";
    import { streamToPlayableUrl } from "../meta/streamLogic";
    import * as ProgressLogic from "../meta/progressLogic";
    import { progressMap as metaProgressMap, streamsPopupVisible, selectedStream } from "../meta/metaState";
    import { markCurrentStreamAsFailed } from "../meta/streamLogic";

    import {
        isPlaying,
        loading,
        loadingStage,
        loadingDetails,
        loadingProgress,
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
    import { getPlaybackAnalyticsProps as buildPlaybackAnalyticsProps } from "./playerAnalytics";
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
    import { createPlayerModalHandlers } from "./playerModalHandlers";
    import {
        startNextEpisodePrefetch,
        type NextEpisodePrefetchHandoff,
    } from "./nextEpisodePrefetch";
    import { serverUrl } from "../../lib/client";
    import type { Chapter } from "./types";

    // Props
    export let videoSrc: string | null = null;
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
    export let autoSkipFromNextEpisode: boolean = false;

    const imdbID = metaData?.meta?.imdb_id || null;

    const handleProgressInternal = (time: number, dur: number) => {
        if (onProgress) {
            onProgress(time, dur);
        } else if (imdbID) {
            ProgressLogic.handleProgress(time, dur, imdbID, hasStarted);
        }
    };

    const handleNextEpisodeInternal = () => {
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
    let nextEpisodePrefetchVideo: HTMLVideoElement | null = null;
    let nextEpisodePrefetchDispose: ((opts?: { transfer?: boolean }) => void) | null =
        null;
    let nextEpisodePrefetchHandoff: NextEpisodePrefetchHandoff | null = null;
    let bingeAutoAdvancing = false;
    let nextEpisodePrefetchRunId = 0;
    let nextEpisodePrefetchStarting = false;
    let effectiveChapterMarkers: Chapter[] = [];
    let skipButtonLabel = "Skip Intro";
    let miniPlayerActive = false;
    let lastMiniPlayerActive: boolean | null = null;
    let canEnterMiniPlayer = false;
    let isPlayerRoute = true;
    let loadingBackdropSrc: string | null = null;
    let loadingBackdropMode: "art" | "frame" = "art";

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
        const entering = typeof document !== "undefined"
            ? !(document as any).fullscreenElement
            : null;
        trackEvent("player_fullscreen_toggled", {
            entering,
            ...getPlaybackAnalyticsProps(),
        });
        controlsManager?.toggleFullscreen?.();
    };

    const handleToggleObjectFit = () => {
        trackEvent("player_object_fit_toggled", {
            ...getPlaybackAnalyticsProps(),
        });

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
        trackEvent("audio_selector_opened", getPlaybackAnalyticsProps());
        showAudioSelection.set(true);
    };

    const openSubtitleSelection = () => {
        trackEvent("subtitle_selector_opened", getPlaybackAnalyticsProps());
        showSubtitleSelection.set(true);
    };

    const openWatchPartyModal = () => {
        if ($localMode || !$cloudSyncStatus.cloudFeaturesAvailable) {
            showWatchPartyModal.set(false);
            return;
        }
        trackEvent("watch_party_modal_opened", getPlaybackAnalyticsProps());
        showWatchPartyModal.set(true);
    };

    const getPlaybackAnalyticsProps = () =>
        buildPlaybackAnalyticsProps({
            currentVideoSrc,
            sessionData: $sessionData,
            duration: $duration,
            currentTime: $currentTime,
            metaData,
            season,
            episode,
            watchPartyActive: $watchParty.isActive,
        });

    const trackPlaybackClosed = () => {
        if (playbackClosedTracked) return;
        if (!currentVideoSrc) return;
        playbackClosedTracked = true;
        trackEvent("playback_closed", getPlaybackAnalyticsProps());
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
        trackPlaybackClosed();
        await exitFullscreenIfNeeded();
        if (!router.back()) {
            router.navigate("home");
        }
    };

    let videoElem: HTMLVideoElement;
    let playerContainer: HTMLDivElement;
    let canvasElem: HTMLCanvasElement;
    let hls: any = null;
    let sessionId: string;
    let currentVideoSrc: string | null = null;
    let metadataCheckInterval: any;
    let playbackStartTracked = false;
    let playbackClosedTracked = false;
    let bufferingActive = false;
    let bufferingStartedAt = 0;
    let errorModalOpen = false;
    let reprobeAttempted = false;
    let torrentFailureExitTimeout: ReturnType<typeof setTimeout> | null = null;

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

    $: showNextEpisodeAllowed = $showNextEpisode && hasNextEpisode;

    const disposeNextEpisodePrefetch = (opts?: { transfer?: boolean }) => {
        nextEpisodePrefetchRunId += 1;
        nextEpisodePrefetchStarting = false;
        if (nextEpisodePrefetchDispose) {
            nextEpisodePrefetchDispose(opts);
            nextEpisodePrefetchDispose = null;
        }
        nextEpisodePrefetchHandoff = null;
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

        trackEvent("torrent_stream_failed", {
            reason: details || null,
            ...getPlaybackAnalyticsProps(),
        });

        torrentFailureExitTimeout = setTimeout(() => {
            showError.set(false);
            handleClose();
            torrentFailureExitTimeout = null;
        }, 1400);
    };

    const torrentStatusPoller = createTorrentStatusPoller({
        serverUrl,
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
        getVideoElem: () => videoElem,
        getHls: () => hls,
        setHls: (value) => {
            hls = value;
        },
        setSessionId: (value) => {
            sessionId = value;
        },
        getSessionId: () => sessionId,
        getCueLinePercent: () => cueLinePercent,
        shouldShowSeekStyleInfoModal,
        setPendingStartAfterSeekStyleModal: (value) => {
            pendingStartAfterSeekStyleModal = value;
        },
        setHasStarted: (value) => (hasStarted = value),
        setIntroDbChapters: (chapters) => {
            introDbChapters = chapters;
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
            const bingeStartup =
                metaData?.meta?.type === "series" &&
                Boolean(get(selectedStream)?.behaviorHints?.bingeGroup) &&
                !get(watchParty).isActive;
            const effectiveStartTime = Chapters.getStartupSkipTarget(startTime, effectiveChapters, {
                autoSkipIntros: $autoSkipIntros || autoSkipFromNextEpisode || bingeStartup,
                autoSkipRecap: autoSkipFromNextEpisode || bingeStartup,
            });

            return {
                effectiveStartTime,
                introDbChapters: nextIntroDbChapters,
            };
        },
        startTorrentStatusPolling: torrentStatusPoller.start,
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
            onAfterSeek: () =>
                Discord.updateDiscordActivity(
                    metaData,
                    season,
                    episode,
                    $duration,
                    $currentTime,
                    $isPlaying,
                ),
            isWatchPartyHost: $watchParty.isHost,
            isPlaying: $isPlaying,
            updatePlaybackState: WatchParty.updatePlaybackState,
            setPendingSeek: pendingSeek.set,
            setCurrentTime: currentTime.set,
            setShowCanvas: showCanvas.set,
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
            loadingBackdropSrc = null;
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
                    console.log(
                        "Missing metadata detected, attempting to reload session...",
                    );
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
        };
    });

    onDestroy(() => {
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
        trackPlaybackClosed();
        void exitFullscreenIfNeeded();
        clearInterval(metadataCheckInterval);
        torrentStatusPoller.stop();
        if (playPauseFeedbackTimeout) clearTimeout(playPauseFeedbackTimeout);
        if (torrentFailureExitTimeout) clearTimeout(torrentFailureExitTimeout);
        playerSessionLoader.clearLoadTimeout();
        disposeNextEpisodePrefetch();
        Session.cleanupSession(
            hls,
            sessionId,
            Discord.clearDiscordActivity,
            WatchParty.leaveWatchParty,
            $watchParty.isActive,
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
                if (
                    result.currentChapter?.kind === "intro" ||
                    result.currentChapter?.kind === "recap"
                ) {
                    seekToTime(result.currentChapter.endTime + 0.1);
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

                if (
                    imdbID &&
                    hasNextEpisode &&
                    !nextEpisodePrefetchDispose &&
                    !nextEpisodePrefetchStarting &&
                    time >= nextEpisodePrefetchWindow.startAt &&
                    time < nextEpisodePrefetchWindow.creditsAt &&
                    nextEpisodePrefetchWindow.creditsAt > 0
                ) {
                    nextEpisodePrefetchStarting = true;
                    const runId = ++nextEpisodePrefetchRunId;
                    void (async () => {
                        try {
                            const resolved = await NavigationLogic.resolveNextEpisodeStream(imdbID);
                            if (runId !== nextEpisodePrefetchRunId) return;
                            if (!nextEpisodePrefetchVideo || !resolved) return;
                            const playable = streamToPlayableUrl(resolved.stream);
                            if (!playable) return;
                            const { dispose, handoff } = await startNextEpisodePrefetch(
                                playable.url,
                                playable.fileIdx,
                                nextEpisodePrefetchVideo,
                                () => {},
                            );
                            if (runId !== nextEpisodePrefetchRunId) {
                                dispose();
                                return;
                            }
                            nextEpisodePrefetchDispose = dispose;
                            nextEpisodePrefetchHandoff = handoff;
                        } finally {
                            nextEpisodePrefetchStarting = false;
                        }
                    })();
                }
            }
        }
    };

    const handlePlay = () => {
        isPlaying.set(true);
        hasStarted = true;
        void traktScrobbler.send("start");
        if (!playbackStartTracked) {
            trackEvent("playback_started", getPlaybackAnalyticsProps());
            playbackStartTracked = true;
        }
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
    };

    const handlePause = () => {
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
        trackEvent("playback_buffering_started", getPlaybackAnalyticsProps());
    };

    const handleBufferEnd = () => {
        if (!bufferingActive) return;
        bufferingActive = false;
        const durationMs = Date.now() - bufferingStartedAt;
        trackEvent("playback_buffering_ended", {
            buffer_duration_ms: durationMs,
            ...getPlaybackAnalyticsProps(),
        });
    };

    const reloadSession = () => {
        if (!currentVideoSrc) return;

        Session.cleanupSession(
            hls,
            sessionId,
            Discord.clearDiscordActivity,
            WatchParty.leaveWatchParty,
            $watchParty.isActive,
        );
        loadVideo(currentVideoSrc);
    };

    $: if (!$loading) {
        torrentStatusPoller.stop();
    }

    $: if ($showError && !errorModalOpen) {
        errorModalOpen = true;
        trackEvent("player_error_shown", {
            message: $errorMessage || null,
            ...getPlaybackAnalyticsProps(),
        });
    }

    $: if (!$showError && errorModalOpen) {
        errorModalOpen = false;
    }

    const showActionLoading = (actionLabel: string, err: unknown) => {
        loading.set(false);
        showError.set(true);
        errorMessage.set(actionLabel);
        errorDetails.set(err instanceof Error ? err.message : String(err));
    };

    const handleSkipIntro = () => {
        trackEvent("skip_chapter_clicked", {
            chapter_kind: $currentChapter?.kind || null,
            chapter_source: $currentChapter?.source || null,
            ...getPlaybackAnalyticsProps(),
        });
        Chapters.skipChapter($currentChapter, seekToTime);
    };

    const handleNextEpisodeClick = createNextEpisodeHandler({
        trackEvent,
        getPlaybackAnalyticsProps,
        handleProgressInternal,
        getVideoSrc: () => videoSrc,
        setCurrentVideoSrc: (value) => {
            currentVideoSrc = value;
        },
        invokeNextEpisode: handleNextEpisodeInternal,
        showActionLoading,
        suppressInitialLoading: () => nextEpisodePrefetchHandoff != null,
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
        getSessionId: () => sessionId,
        getVideoElem: () => videoElem,
        getHls: () => hls,
        setHls: (value) => {
            hls = value;
        },
        getCueLinePercent: () => cueLinePercent,
        getPlaybackAnalyticsProps,
        getVideoSrc: () => videoSrc,
        loadVideo,
        handleClose,
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

    $: if (videoSrc && videoSrc !== currentVideoSrc) {
        introDbChapters = [];
        effectiveChapterMarkers = [];
        skipButtonLabel = "Skip Intro";
        currentVideoSrc = videoSrc;
        hasStarted = false;
        playbackStartTracked = false;
        playbackClosedTracked = false;
        bingeAutoAdvancing = false;

        const handoff = nextEpisodePrefetchHandoff;
        const canReuseHandoff =
            handoff &&
            handoff.src === videoSrc &&
            handoff.fileIdx === fileIdx &&
            startTime === 0;

        const reuseSession = canReuseHandoff
            ? {
                  sessionId: handoff.sessionId,
                  sessionData: handoff.sessionData,
              }
            : undefined;

        disposeNextEpisodePrefetch(reuseSession ? { transfer: true } : undefined);
        Session.cleanupSession(
            hls,
            sessionId,
            Discord.clearDiscordActivity,
            WatchParty.leaveWatchParty,
            $watchParty.isActive,
        );
        loadVideo(videoSrc, reuseSession ? { reuseSession } : undefined);
    }

    $: effectiveChapterMarkers = Chapters.getEffectiveChapterSegments($sessionData, introDbChapters);

    $: if (videoElem) {
        videoElem.muted = false;
    }

    $: if ($loading && !hasStarted) {
        loadingBackdropSrc = null;
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

    $: if ($showWatchPartyModal && !$cloudSyncStatus.cloudFeaturesAvailable) {
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
        <video
            bind:this={nextEpisodePrefetchVideo}
            class="fixed left-[-9999px] top-0 w-px h-px opacity-0 pointer-events-none"
            muted
            playsinline
            preload="auto"
            aria-hidden="true"
        ></video>
        <PlayerVideo
            bind:videoElem
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
                captureLoadingBackdrop();
                loading.set(true);
                loadingStage.set("Buffering");
                handleBufferStart();
            }}
            on:playing={() => {
                loading.set(false);
                loadingStage.set("");
                loadingDetails.set("");
                loadingProgress.set(null);
                handleBufferEnd();
            }}
            on:canplay={() => {
                loading.set(false);
            }}
        />
    </div>

    {#if playPauseFeedback}
        <PlayPauseFeedback
            type={playPauseFeedback.type}
            id={playPauseFeedback.id}
        />
    {/if}

    {#if miniPlayerActive}
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

    {#if $seekFeedback}
        <SeekFeedback type={$seekFeedback.type} id={$seekFeedback.id} />
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
    />

    {#if !$loading && !miniPlayerActive}
        <div
            class="absolute left-0 top-0 p-10 z-50 transition-all duration-300 ease-in-out transform {$controlsVisible
                ? 'translate-y-0 opacity-100'
                : '-translate-y-10 opacity-0 pointer-events-none'} will-change-transform will-change-opacity"
        >
            <button
                class="bg-[#000000]/20 backdrop-blur-md hover:bg-[#FFFFFF]/20 transition-colors duration-200 rounded-full p-4 cursor-pointer"
                on:click={handleClose}
                aria-label="Close player"
            >
                <ChevronLeft size={30} color="white" strokeWidth={2} />
            </button>
        </div>

        <div
            class="absolute left-1/2 -translate-x-1/2 bottom-12.5 z-50 flex flex-col gap-2.5"
        >
            <PlayerOverlays
                showSkipIntro={$showSkipIntro}
                showNextEpisode={showNextEpisodeAllowed}
                isWatchPartyMember={!$localMode && $watchParty.isActive && !$watchParty.isHost}
                skipLabel={skipButtonLabel}
                skipChapter={handleSkipIntro}
                nextEpisode={handleNextEpisodeClick}
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
                    {sessionId}
                    {videoSrc}
                    {metaData}
                    {hasNextEpisode}
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
                    onNextEpisode={handleNextEpisodeClick}
                    showWatchParty={!$localMode && $cloudSyncStatus.cloudFeaturesAvailable}
                    onAudioClick={openAudioSelection}
                    onSubtitleClick={openSubtitleSelection}
                    onWatchPartyClick={() => {
                        if (!$localMode && $cloudSyncStatus.cloudFeaturesAvailable) {
                            openWatchPartyModal();
                        } else {
                            showWatchPartyModal.set(false);
                        }
                    }}
                    onClipPanelOpenChange={(detail) => {
                        clipPanelOpen = !!detail?.open;
                        controlsManager?.setPinned?.(clipPanelOpen, controlsVisible.set);
                        trackEvent("clip_panel_toggled", {
                            open: clipPanelOpen,
                            ...getPlaybackAnalyticsProps(),
                        });
                    }}
                />
            </div>
        </div>
    {/if}

    <PlayerModals
        showAudioSelection={$showAudioSelection}
        showSubtitleSelection={$showSubtitleSelection}
        showError={$showError}
        showWatchPartyModal={$showWatchPartyModal && !$localMode && $cloudSyncStatus.cloudFeaturesAvailable}
        showSeekStyleModal={$showSeekStyleModal}
        audioTracks={$audioTracks}
        subtitleTracks={$subtitleTracks}
        errorMessage={$errorMessage}
        errorDetails={$errorDetails}
        {seekBarStyle}
        {metaData}
        {season}
        {episode}
        {videoSrc}
        {fileIdx}
        onSeekStyleChange={handleSeekStyleChange}
        onSeekStyleAcknowledge={handleSeekStyleAcknowledge}
        onAudioSelect={modalHandlers.onAudioSelect}
        onSubtitleSelect={modalHandlers.onSubtitleSelect}
        onSubtitleDelayChange={modalHandlers.onSubtitleDelayChange}
        onErrorRetry={modalHandlers.onErrorRetry}
        onErrorBack={modalHandlers.onErrorBack}
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
