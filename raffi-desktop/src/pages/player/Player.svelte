<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import { get } from "svelte/store";
    import { router } from "../../lib/stores/router";
    import PlayerControls from "../../components/player/PlayerControls.svelte";
    import PlayerOverlays from "../../components/player/PlayerOverlays.svelte";
    import SeekFeedback from "../../components/player/SeekFeedback.svelte";
    import PlayPauseFeedback from "../../components/player/PlayPauseFeedback.svelte";
    import PlayerVideo from "./components/PlayerVideo.svelte";
    import PlayerLoadingScreen from "./components/PlayerLoadingScreen.svelte";
    import PlayerModals from "./components/PlayerModals.svelte";
    import PlayerWatchParty from "./components/PlayerWatchParty.svelte";
    import CastDeviceModal from "../../components/player/CastDeviceModal.svelte";
    import type { ShowResponse } from "../../lib/library/types/meta_types";
    import { watchParty } from "../../lib/stores/watchPartyStore";
    import { localMode } from "../../lib/stores/authStore";
    import { flushPendingLibraryProgress } from "../../lib/db/db";
    import { trackEvent } from "../../lib/analytics";
    import { ChevronLeft } from "lucide-svelte";
    import * as NavigationLogic from "../meta/navigationLogic";
    import * as ProgressLogic from "../meta/progressLogic";
    import { progressMap as metaProgressMap, streamsPopupVisible } from "../meta/metaState";
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
    import { createPlayerCastController } from "./playerCastController";
    import { getCastStatus, listCastDevices, type CastDevice } from "../../lib/cast";

    import { serverUrl } from "../../lib/client";

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
            // ignore
        }
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
        controlsManager?.toggleObjectFit?.($objectFit, objectFit.set);
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
        if ($localMode) {
            showWatchPartyModal.set(false);
            return;
        }
        trackEvent("watch_party_modal_opened", getPlaybackAnalyticsProps());
        showWatchPartyModal.set(true);
    };

    const handleClose = () => {
        if (imdbID) {
            void flushPendingLibraryProgress(imdbID);
        }
        if (hasStarted && !traktScrobbler.isStopSent()) {
            void traktScrobbler.send("stop", true);
        }
        trackPlaybackClosed();
        if (!router.back()) {
            router.navigate("home");
        }
    };

    // Local refs
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
    let castActive = false;
    let castBusy = false;
    let castTransport: "native" | "chrome" | null = null;
    let castDeviceName = "";
    let showCastDeviceModal = false;
    let castDeviceModalLoading = false;
    let castDeviceModalMode: "native" | "chrome" = "native";
    let castModalStep: "mode" | "native-devices" = "mode";
    let nativeCastDevices: CastDevice[] = [];
    let castStatusInterval: ReturnType<typeof setInterval> | null = null;

    const showCastDeviceScanLoading = (mode: "native" | "chrome") => {
        showCastDeviceModal = true;
        castDeviceModalLoading = true;
        castDeviceModalMode = mode;
    };

    const showCastDeviceModePicker = () => {
        showCastDeviceModal = true;
        castDeviceModalLoading = false;
        castDeviceModalMode = "native";
        castModalStep = "mode";
        nativeCastDevices = [];
    };

    const hideCastDevicePicker = () => {
        showCastDeviceModal = false;
        castDeviceModalLoading = false;
        castModalStep = "mode";
        nativeCastDevices = [];
    };

    const castController = createPlayerCastController({
        getSessionId: () => sessionId,
        isCastActive: () => castActive,
        isCastBusy: () => castBusy,
        setCastBusy: (busy) => {
            castBusy = busy;
        },
        setCastActive: (active) => {
            castActive = active;
        },
        setCastDeviceName: (name) => {
            castDeviceName = name;
        },
        setCastTransport: (mode) => {
            castTransport = mode;
        },
        getCastTransport: () => castTransport,
        setHasStarted: (started) => {
            hasStarted = started;
        },
        getCurrentTime: () => $currentTime,
        getPlaybackOffset: () => $playbackOffset,
        setCurrentTime: currentTime.set,
        setVolumeLevel: volume.set,
        setIsPlaying: isPlaying.set,
        setPendingSeek: pendingSeek.set,
        pauseLocalVideo: () => {
            if (videoElem && !videoElem.paused) {
                videoElem.pause();
            }
            if (videoElem) {
                videoElem.muted = true;
            }
            if (hls) {
                Session.detachLocalPlayback(hls, videoElem);
                hls = null;
            }
        },
        showDeviceScanLoading: showCastDeviceScanLoading,
        hideDevicePicker: hideCastDevicePicker,
        showAlert: async (message: string, title: string) => {
            const electronApi = (window as any).electronAPI;
            if (electronApi?.showAlertDialog) {
                await electronApi.showAlertDialog(message, title);
            }
        },
        trackEvent,
        getPlaybackAnalyticsProps,
        getMetadata: () => ({
            title: metaData?.meta?.name,
            subtitle:
                metaData?.meta?.type === "series" && season != null && episode != null
                    ? `S${season} E${episode}`
                    : undefined,
            cover: String((metaData as any)?.meta?.poster || (metaData as any)?.meta?.logo || ""),
            background: String((metaData as any)?.meta?.background || ""),
            durationSeconds: Number($duration || 0),
        }),
    });

    const openCastBootstrap = async () => {
        if (castBusy) return;
        if (castActive) {
            await castController.connectOrDisconnect(castTransport || "native");
            return;
        }
        showCastDeviceModePicker();
    };

    const startCastWithMode = async (mode: "native" | "chrome") => {
        await castController.connectOrDisconnect(mode);
    };

    const openNativeDeviceSelection = async () => {
        castModalStep = "native-devices";
        castDeviceModalMode = "native";
        castDeviceModalLoading = true;
        nativeCastDevices = [];
        try {
            const devices = await listCastDevices(5000);
            nativeCastDevices = devices;
            if (devices.length === 0) {
                await ((window as any).electronAPI?.showAlertDialog?.(
                    "No Chromecast devices found. Make sure your TV and computer are on the same LAN.",
                    "No Cast Devices",
                ) || Promise.resolve());
            }
        } catch (error) {
            await ((window as any).electronAPI?.showAlertDialog?.(
                error instanceof Error ? error.message : String(error),
                "Native Cast Discovery Failed",
            ) || Promise.resolve());
        } finally {
            castDeviceModalLoading = false;
        }
    };

    const startNativeCastWithDevice = async (deviceId: string) => {
        await castController.connectOrDisconnect("native", deviceId);
    };

    const startCastStatusPolling = () => {
        if (castStatusInterval) {
            return;
        }

        const poll = async () => {
            if (!castActive) {
                return;
            }
            try {
                const status = await getCastStatus();
                if (!status?.active) {
                    castActive = false;
                    castTransport = null;
                    castDeviceName = "";
                    return;
                }

                if (status.deviceName) {
                    castDeviceName = status.deviceName;
                }
                if (status.transport) {
                    castTransport = status.transport;
                }

                if (castTransport === "native" || castTransport === "chrome") {
                    const castTime = Number(status.currentTime || 0);
                    const playbackOffsetValue = get(playbackOffset);
                    const playbackOffsetSeconds = Math.max(0, Number(playbackOffsetValue || 0));
                    if (Number.isFinite(castTime) && castTime >= 0) {
                        const absoluteCastTime = castTime + playbackOffsetSeconds;
                        hasStarted = true;
                        currentTime.set(absoluteCastTime);
                        handleProgressInternal(absoluteCastTime, $duration);
                    }
                    const playerState = String(status.playerState || "").toUpperCase();
                    if (playerState.includes("PAUSE") || playerState.includes("IDLE")) {
                        isPlaying.set(false);
                    } else if (playerState.length > 0) {
                        isPlaying.set(true);
                    }
                }
            } catch {
                // ignore transient status polling errors
            }
        };

        void poll();
        castStatusInterval = setInterval(() => {
            void poll();
        }, 1000);
    };

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

    $: showNextEpisodeAllowed = $showNextEpisode && hasNextEpisode;

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
        fileIdx,
        startTime,
        autoPlay,
        metaData,
        season,
        episode,
        getVideoElem: () => videoElem,
        getHls: () => hls,
        setHls: (value) => {
            hls = value;
        },
        setSessionId: (value) => {
            sessionId = value;
        },
        getCueLinePercent: () => cueLinePercent,
        shouldShowSeekStyleInfoModal,
        setPendingStartAfterSeekStyleModal: (value) => {
            pendingStartAfterSeekStyleModal = value;
        },
        setHasStarted: (value) => (hasStarted = value),
        startTorrentStatusPolling: torrentStatusPoller.start,
        stopTorrentStatusPolling: torrentStatusPoller.stop,
        awaitDomUpdate: tick,
    });

    const loadVideo = playerSessionLoader.loadVideo;

    const seekToTime = (targetTime: number) => {
        if (castActive) {
            void castController.seek(targetTime);
            return;
        }
        if (!videoElem) return;
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

        if (castActive) {
            if (castTransport === "native") {
                triggerPlayPauseFeedback($isPlaying ? "pause" : "play");
                void castController.togglePlay($isPlaying);
            }
            return;
        }

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

        loadingStage.set("Loading...");
        loadingDetails.set("");
        loadingProgress.set(null);

        seekBarStyle = getSeekBarStyleFromStorage();

        if (joinPartyId && autoJoin && !$localMode) {
            showWatchPartyModal.set(true);
        }

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
    });

    onDestroy(() => {
        if (imdbID) {
            void flushPendingLibraryProgress(imdbID);
        }
        if (hasStarted && !traktScrobbler.isStopSent()) {
            void traktScrobbler.send("stop", true);
        }
        trackPlaybackClosed();
        clearInterval(metadataCheckInterval);
        torrentStatusPoller.stop();
        if (playPauseFeedbackTimeout) clearTimeout(playPauseFeedbackTimeout);
        if (torrentFailureExitTimeout) clearTimeout(torrentFailureExitTimeout);
        playerSessionLoader.clearLoadTimeout();
        Session.cleanupSession(
            hls,
            sessionId,
            Discord.clearDiscordActivity,
            WatchParty.leaveWatchParty,
            $watchParty.isActive,
        );
        void castController.cleanup();
        if (castStatusInterval) {
            clearInterval(castStatusInterval);
            castStatusInterval = null;
        }
        resetPlayerState();
        hasStarted = false;
    });

    const handleTimeUpdate = () => {
        if (castActive) return;
        if (!videoElem) return;
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
            );
            currentChapter.set(result.currentChapter);
            showSkipIntro.set(result.showSkipIntro);
            showNextEpisode.set(result.showNextEpisode);
        }
    };

    const handlePlay = () => {
        if (castActive) return;
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
        if (castActive) return;
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

    const handleEnded = () => {
        if (hasStarted && !traktScrobbler.isStopSent()) {
            void traktScrobbler.send("stop", true);
        }
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
        trackEvent("skip_intro_clicked", getPlaybackAnalyticsProps());
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
    });

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
        currentVideoSrc = videoSrc;
        hasStarted = false;
        playbackStartTracked = false;
        playbackClosedTracked = false;
        Session.cleanupSession(
            hls,
            sessionId,
            Discord.clearDiscordActivity,
            WatchParty.leaveWatchParty,
            $watchParty.isActive,
        );
        loadVideo(videoSrc);
    }

    $: if (!castActive && videoElem) {
        videoElem.muted = false;
    }

    $: if (castActive) {
        if (!castStatusInterval) {
            startCastStatusPolling();
        }
    } else if (castStatusInterval) {
        clearInterval(castStatusInterval);
        castStatusInterval = null;
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
>
    <div class="w-full h-full">
        <PlayerVideo
            bind:videoElem
            bind:canvasElem
            objectFit={$objectFit}
            showCanvas={$showCanvas}
            hidden={castActive}
            on:timeupdate={handleTimeUpdate}
            on:play={handlePlay}
            on:pause={handlePause}
            on:ended={handleEnded}
            on:click={togglePlayWithFeedback}
            on:waiting={() => {
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

    {#if $seekFeedback}
        <SeekFeedback type={$seekFeedback.type} id={$seekFeedback.id} />
    {/if}

    <PlayerLoadingScreen
        loading={$loading}
        onClose={handleClose}
        {metaData}
        stage={$loadingStage}
        details={$loadingDetails}
        progress={$loadingProgress}
    />

    {#if castActive}
        <div class="absolute inset-0 z-20 flex items-center justify-center bg-black text-white pointer-events-none">
            <div class="text-center">
                <div class="text-2xl font-semibold">Casting to {castDeviceName || "Chromecast"}</div>
                <div class="text-sm text-white/70 mt-2">
                    {castTransport === "chrome"
                        ? "Playback is running on your TV via Chrome"
                        : "Playback is running on your TV"}
                </div>
            </div>
        </div>
    {/if}

    {#if !$loading}
        <div
            class="absolute left-0 top-0 p-10 z-50 transition-all duration-300 ease-in-out transform {$controlsVisible
                ? 'translate-y-0 opacity-100'
                : '-translate-y-10 opacity-0 pointer-events-none'}"
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
            class="absolute left-1/2 -translate-x-1/2 bottom-12.5 z-50 flex flex-col gap-2.5 transition-all duration-300 ease-in-out transform {$controlsVisible
                ? 'translate-y-0 opacity-100'
                : 'translate-y-10 opacity-0 pointer-events-none'}"
            bind:this={controlsOverlayElem}
        >
        <PlayerOverlays
            showSkipIntro={$showSkipIntro}
            showNextEpisode={showNextEpisodeAllowed}
            isWatchPartyMember={!$localMode && $watchParty.isActive && !$watchParty.isHost}
            skipChapter={handleSkipIntro}
            nextEpisode={handleNextEpisodeClick}
        />


            <PlayerControls
                isPlaying={$isPlaying}
                duration={$duration}
                currentTime={$currentTime}
                pendingSeek={$pendingSeek}
                volume={$volume}
                controlsVisible={$controlsVisible}
                loading={$loading}
                {seekBarStyle}
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
                onVolumeChange={(e) =>
                    castActive && castTransport === "native"
                        ? (() => {
                            const target = e.target as HTMLInputElement;
                            const nextVolume = Number(target?.value ?? $volume);
                            if (!Number.isFinite(nextVolume)) return;
                            void castController.setVolume(nextVolume);
                        })()
                        : controlsManager.onVolumeChange(e, volume.set)}
                toggleFullscreen={handleToggleFullscreen}
                objectFit={$objectFit}
                toggleObjectFit={handleToggleObjectFit}
                onNextEpisode={handleNextEpisodeClick}
                {castActive}
                {castBusy}
                {castDeviceName}
                on:audioClick={openAudioSelection}
                on:castClick={openCastBootstrap}
                on:subtitleClick={openSubtitleSelection}
                on:watchPartyClick={() => {
                    if (!$localMode) {
                        openWatchPartyModal();
                    } else {
                        showWatchPartyModal.set(false);
                    }
                }}
                on:clipPanelOpenChange={(e) => {
                    clipPanelOpen = !!e.detail?.open;
                    controlsManager?.setPinned?.(clipPanelOpen, controlsVisible.set);
                    trackEvent("clip_panel_toggled", {
                        open: clipPanelOpen,
                        ...getPlaybackAnalyticsProps(),
                    });
                }}
            />
        </div>
    {/if}

    <PlayerModals
        showAudioSelection={$showAudioSelection}
        showSubtitleSelection={$showSubtitleSelection}
        showError={$showError}
        showWatchPartyModal={$showWatchPartyModal && !$localMode}
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
        onAddLocalSubtitle={modalHandlers.onAddLocalSubtitle}
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
            handleClose();
        }}
    />

    <CastDeviceModal
        open={showCastDeviceModal}
        loading={castDeviceModalLoading}
        loadingMode={castDeviceModalMode}
        step={castModalStep}
        nativeDevices={nativeCastDevices}
        on:selectNativeDevice={(e) => {
            void startNativeCastWithDevice((e as CustomEvent<{ deviceId: string }>).detail?.deviceId || "");
        }}
        onBackToMode={() => {
            castModalStep = "mode";
            castDeviceModalLoading = false;
        }}
        onNative={() => {
            void openNativeDeviceSelection();
        }}
        onChrome={() => {
            void startCastWithMode("chrome");
        }}
        onCancel={hideCastDevicePicker}
    />
</div>
