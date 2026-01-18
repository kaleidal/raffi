<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import { router } from "../../lib/stores/router";
    import PlayerControls from "../../components/player/PlayerControls.svelte";
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
    import { trackEvent } from "../../lib/analytics";

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
        firstSeekLoad,
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

    import { serverUrl } from "../../lib/client";

    // Props
    export let videoSrc: string | null = null;
    export let fileIdx: number | null = null;
    export let metaData: ShowResponse | null = null;
    export let autoPlay: boolean = true;
    export let onClose: () => void = () => {};
    export let onNextEpisode: () => void = () => {};
    export let hasStarted = false;
    export let onProgress: (time: number, duration: number) => void = () => {};
    export let startTime: number = 0;
    export let season: number | null = null;
    export let episode: number | null = null;
    export let joinPartyId: string | null = null;
    export let autoJoin: boolean = false;

    type SeekBarStyle = "raffi" | "normal";
    const SEEK_BAR_STYLE_KEY = "seek_bar_style";
    const SEEK_STYLE_INFO_ACK_KEY = "seek_style_info_ack";

    let seekBarStyle: SeekBarStyle = "raffi";
    let pendingStartAfterSeekStyleModal = false;

    const getSeekBarStyleFromStorage = (): SeekBarStyle => {
        const v = localStorage.getItem(SEEK_BAR_STYLE_KEY);
        return v === "normal" ? "normal" : "raffi";
    };

    const shouldShowSeekStyleInfoModal = (): boolean => {
        const ack = localStorage.getItem(SEEK_STYLE_INFO_ACK_KEY);
        if (ack === "true") return false;

        const storedSeek = localStorage.getItem(SEEK_BAR_STYLE_KEY);
        if (storedSeek !== null) return false;

        return true;
    };

    const handleSeekStyleChange = (style: SeekBarStyle) => {
        seekBarStyle = style;
        localStorage.setItem(SEEK_BAR_STYLE_KEY, style);
    };

    const handleSeekStyleAcknowledge = async () => {
        localStorage.setItem(SEEK_STYLE_INFO_ACK_KEY, "true");
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

    const normalizeLang = (raw?: string | null): string | null => {
        if (!raw) return null;
        const s = String(raw).toLowerCase().trim();
        if (!s) return null;

        if (s === "en" || s === "eng" || s === "english") return "en";
        if (s === "ja" || s === "jpn" || s === "japanese") return "ja";
        if (s === "es" || s === "spa" || s === "spanish") return "es";
        if (s === "fr" || s === "fra" || s === "fre" || s === "french") return "fr";
        if (s === "de" || s === "deu" || s === "ger" || s === "german") return "de";

        if (/^[a-z]{2}$/.test(s)) return s;
        if (/^[a-z]{3}$/.test(s)) return s;

        const match2 = s.match(/\b[a-z]{2}\b/);
        if (match2?.[0]) return match2[0];

        const match3 = s.match(/\b[a-z]{3}\b/);
        if (match3?.[0]) return match3[0];

        return null;
    };

    const getPreferredSubtitleLang = (sess: any): string | null => {
        const audioIndex = Number.isFinite(sess?.audioIndex)
            ? Number(sess.audioIndex)
            : 0;
        const streams = Array.isArray(sess?.availableStreams)
            ? sess.availableStreams
            : [];
        const audioStream = streams.find(
            (s: any) => s?.type === "audio" && s?.index === audioIndex,
        );
        return normalizeLang(audioStream?.language || audioStream?.title);
    };

    const autoEnableDefaultSubtitles = async (sess: any) => {
        const tracks = $subtitleTracks;
        if (!tracks || tracks.length === 0) return;

        const alreadySelected = tracks.find((t: any) => t?.selected);
        if (alreadySelected && String(alreadySelected.id) !== "off") return;

        const preferredLang = getPreferredSubtitleLang(sess);
        const candidates = tracks.filter((t: any) => String(t?.id) !== "off");
        if (candidates.length === 0) return;

        const findByLang = (lang: string) =>
            candidates.find((t: any) => normalizeLang(t?.lang) === lang);

        const picked =
            (preferredLang ? findByLang(preferredLang) : undefined) ||
            findByLang("en");

        if (!picked) return;
        if (!videoElem) return;

        subtitleTracks.update((all) =>
            all.map((t: any) => ({
                ...t,
                selected: String(t?.id) === String(picked.id),
            })),
        );
        currentSubtitleLabel.set(picked.label);
        await Subtitles.handleSubtitleSelect(
            picked,
            videoElem,
            $currentTime,
            $playbackOffset,
            () => cueLinePercent,
        );
    };

    const getPlaybackSourceType = (src: string | null, sess: any) => {
        if (!src) return "unknown";
        if (sess?.isTorrent || src.startsWith("magnet:")) return "torrent";
        if (!src.startsWith("http://") && !src.startsWith("https://")) return "local";
        return "direct";
    };

    const getPlaybackAnalyticsProps = () => {
        const sourceType = getPlaybackSourceType(currentVideoSrc, $sessionData);
        const isTorrent = sourceType === "torrent";
        const isLocal = sourceType === "local";
        const progressPercent =
            $duration > 0 ? Math.round(($currentTime / $duration) * 100) : null;

        return {
            source_type: sourceType,
            is_torrent: isTorrent,
            is_local: isLocal,
            content_type: metaData?.meta?.type ?? null,
            season: season ?? null,
            episode: episode ?? null,
            watch_party: $watchParty.isActive,
            progress_percent: progressPercent,
            elapsed_seconds: Math.round($currentTime),
        };
    };

    const trackPlaybackClosed = () => {
        if (playbackClosedTracked) return;
        if (!currentVideoSrc) return;
        playbackClosedTracked = true;
        trackEvent("playback_closed", getPlaybackAnalyticsProps());
    };

    const getTrackAnalyticsProps = (detail: any, kind: "audio" | "subtitles") => ({
        kind,
        language: detail?.lang ?? null,
        group: detail?.group ?? null,
        format: detail?.format ?? null,
        is_local: Boolean(detail?.isLocal),
        is_addon: Boolean(detail?.isAddon),
        is_off: detail?.id === "off",
    });

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
        trackPlaybackClosed();
        if (videoSrc) {
            router.navigate("home");
        } else {
            if (onClose && onClose !== (() => {})) {
                onClose();
            } else {
                router.back();
            }
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

    let torrentStatusInterval: ReturnType<typeof setInterval> | null = null;
    let torrentStatusHash: string | null = null;

    const stopTorrentStatusPolling = () => {
        if (torrentStatusInterval) {
            clearInterval(torrentStatusInterval);
            torrentStatusInterval = null;
        }
        torrentStatusHash = null;
    };

    const startTorrentStatusPolling = (hash: string) => {
        if (!hash) return;
        if (torrentStatusInterval && torrentStatusHash === hash) return;

        stopTorrentStatusPolling();
        torrentStatusHash = hash;

        const poll = async () => {
            try {
                const res = await fetch(`${serverUrl}/torrents/${hash}/status`);
                if (!res.ok) return;
                const data = await res.json();

                const stage = String(data.stage || "");
                const peers = typeof data.peers === "number" ? data.peers : null;
                const piecesComplete =
                    typeof data.piecesComplete === "number" ? data.piecesComplete : null;
                const piecesTotal =
                    typeof data.piecesTotal === "number" ? data.piecesTotal : null;
                const progress =
                    typeof data.progress === "number" ? data.progress : null;
                const err = typeof data.error === "string" ? data.error : "";

                if (err) {
                    loadingStage.set("Torrent error");
                    loadingDetails.set(err);
                    loadingProgress.set(null);
                    return;
                }

                if (stage === "metadata") {
                    loadingStage.set("Torrent: fetching metadata");
                    loadingDetails.set(peers != null ? `Peers: ${peers}` : "");
                    loadingProgress.set(null);
                    return;
                }

                if (stage === "downloading") {
                    loadingStage.set("Torrent: downloading");
                    const detailParts: string[] = [];
                    if (peers != null) detailParts.push(`Peers: ${peers}`);
                    if (piecesComplete != null && piecesTotal != null) {
                        detailParts.push(`Pieces: ${piecesComplete}/${piecesTotal}`);
                    }
                    loadingDetails.set(detailParts.join(" • "));
                    loadingProgress.set(progress);
                    return;
                }

                if (stage === "ready") {
                    // Once ready, HLS/transcode/buffering events will usually take over.
                    if ($loading) {
                        loadingStage.set("Torrent: ready (starting stream)");
                        loadingDetails.set("");
                    }
                    loadingProgress.set(null);
                }
            } catch {
                // ignore
            }
        };

        void poll();
        torrentStatusInterval = setInterval(poll, 1000);
    };

    let playPauseFeedback: { type: "play" | "pause"; id: number } | null = null;
    let playPauseFeedbackTimeout: ReturnType<typeof setTimeout> | null = null;
    let loadTimeout: ReturnType<typeof setTimeout> | null = null;

    const triggerPlayPauseFeedback = (type: "play" | "pause") => {
        if (playPauseFeedbackTimeout) clearTimeout(playPauseFeedbackTimeout);
        playPauseFeedback = { type, id: Date.now() };
        playPauseFeedbackTimeout = setTimeout(() => {
            playPauseFeedback = null;
        }, 450);
    };

    const togglePlayWithFeedback = () => {
        if (!videoElem) return;
        if ($watchParty.isActive && !$watchParty.isHost) return;

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
            (t) =>
                Session.performSeek(
                    t,
                    $duration,
                    $playbackOffset,
                    videoElem,
                    () => Session.captureFrame(videoElem, canvasElem),
                    () =>
                        Discord.updateDiscordActivity(
                            metaData,
                            season,
                            episode,
                            $duration,
                            $currentTime,
                            $isPlaying,
                        ),
                    $watchParty.isHost,
                    false,
                    $isPlaying,
                    WatchParty.updatePlaybackState,
                    {
                        setPendingSeek: pendingSeek.set,
                        setCurrentTime: currentTime.set,
                        setShowCanvas: showCanvas.set,
                        setIgnoreNextSeek: () => {}, // Handled internally in sync
                    },
                ),
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
        trackPlaybackClosed();
        clearInterval(metadataCheckInterval);
        stopTorrentStatusPolling();
        if (playPauseFeedbackTimeout) clearTimeout(playPauseFeedbackTimeout);
        if (loadTimeout) clearTimeout(loadTimeout);
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
        const time = $playbackOffset + videoElem.currentTime;
        currentTime.set(time);
        onProgress(time, $duration);

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
        isPlaying.set(true);
        hasStarted = true;
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

    const loadVideo = async (src: string) => {
        try {
            loadingStage.set("Initializing playback");
            loadingDetails.set("");
            loadingProgress.set(null);

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
                    setHasStarted: (value: boolean) => (hasStarted = value),
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
                        metaData,
                        season,
                        episode,
                    ).then((tracks) => {
                        subtitleTracks.update((current) => [
                            ...current,
                            ...tracks,
                        ]);
                    }),
            );

            sessionId = result.sessionId;
            sessionData.set(result.sessionData);

            if (result.sessionData?.isTorrent && result.sessionData?.torrentInfoHash) {
                startTorrentStatusPolling(result.sessionData.torrentInfoHash);
            } else {
                stopTorrentStatusPolling();
            }

            await tick();
            if (!videoElem) return;

            // Hint for the HLS layer: local file paths behave differently than addon/torrent HTTP sources.
            // Used to prevent live-edge style snapping during small seeks.
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
                $duration,
                0,
                false,
            );

            const needsSeekStyleModal = !!autoPlay && shouldShowSeekStyleInfoModal();
            if (needsSeekStyleModal) {
                showSeekStyleModal.set(true);
                pendingStartAfterSeekStyleModal = true;
            }

            const bypassServer = Session.shouldBypassServerForHttpStream(
                src,
                videoElem,
            );

            if (bypassServer) {
                loadingStage.set("Loading stream directly");
                loadingDetails.set("Bypassing server transcoding");
                loadingProgress.set(null);

                if (hls) {
                    try {
                        hls.destroy();
                    } catch {
                        // ignore
                    }
                    hls = null;
                }

                // For direct playback we treat the video element time as the global timeline.
                playbackOffset.set(0);
                void autoEnableDefaultSubtitles(result.sessionData).catch(() => {
                    // ignore
                });
                loading.set(true);

                const onLoaded = () => {
                    if (!videoElem) return;

                    if (Number.isFinite(videoElem.duration) && videoElem.duration > 0) {
                        duration.set(videoElem.duration);
                    }

                    if (startTime > 0) {
                        try {
                            videoElem.currentTime = startTime;
                        } catch {
                            // ignore
                        }
                    }

                    loading.set(false);
                    loadingStage.set("");
                    loadingDetails.set("");
                    showCanvas.set(false);

                    if (!needsSeekStyleModal && autoPlay) {
                        videoElem.play().catch(() => {
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

            void autoEnableDefaultSubtitles(result.sessionData).catch(() => {
                // ignore
            });

            loadingStage.set("Preparing stream");
            loadingDetails.set("Starting HLS session...");
            loadingProgress.set(null);

            hls = Session.initHLS(
                videoElem,
                sessionId,
                startTime,
                needsSeekStyleModal ? false : autoPlay,
                Session.createSeekHandler(
                    videoElem,
                    () => hls,
                    sessionId,
                    () => $pendingSeek,
                    () => $seekGuard,
                    () => $playbackOffset,
                    () => $subtitleTracks,
                    () => $currentSubtitleLabel,
                    (t) =>
                        Subtitles.handleSubtitleSelect(
                            t,
                            videoElem,
                            $currentTime,
                            $playbackOffset,
                            () => cueLinePercent,
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

            if (loadTimeout) {
                clearTimeout(loadTimeout);
            }
            loadTimeout = setTimeout(() => {
                if ($loading && !$hasStartedStore && !$isPlaying) {
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

    $: if (!$loading) {
        stopTorrentStatusPolling();
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

    let nextEpisodeAttemptId = 0;

    const showActionLoading = (actionLabel: string, err: unknown) => {
        loading.set(false);
        showError.set(true);
        errorMessage.set(actionLabel);
        errorDetails.set(err instanceof Error ? err.message : String(err));
    };

    const handleSkipIntro = () => {
        trackEvent("skip_intro_clicked", getPlaybackAnalyticsProps());
        Chapters.skipChapter($currentChapter, (t) =>
            Session.performSeek(
                t,
                $duration,
                $playbackOffset,
                videoElem,
                () => Session.captureFrame(videoElem, canvasElem),
                () =>
                    Discord.updateDiscordActivity(
                        metaData,
                        season,
                        episode,
                        $duration,
                        $currentTime,
                        $isPlaying,
                    ),
                $watchParty.isHost,
                false,
                $isPlaying,
                WatchParty.updatePlaybackState,
                {
                    setPendingSeek: pendingSeek.set,
                    setCurrentTime: currentTime.set,
                    setShowCanvas: showCanvas.set,
                    setIgnoreNextSeek: () => {},
                },
            ),
        );
    };

    const handleNextEpisodeClick = () => {
        trackEvent("next_episode_clicked", getPlaybackAnalyticsProps());

        // Immediately show loading overlay so the action can't be triggered twice.
        nextEpisodeAttemptId += 1;
        const attemptId = nextEpisodeAttemptId;
        currentVideoSrc = videoSrc;
        const beforeSrc = currentVideoSrc;
        loading.set(true);

        if ($duration > 0 && $duration - $currentTime <= 600) {
            onProgress($duration, $duration);
        }

        try {
            const res = (onNextEpisode as unknown as (() => unknown))?.();
            if (res && typeof (res as any).then === "function") {
                (res as Promise<unknown>).catch((err) => {
                    if (attemptId !== nextEpisodeAttemptId) return;
                    showActionLoading("Next Episode Failed", err);
                });
            }
        } catch (err) {
            if (attemptId !== nextEpisodeAttemptId) return;
            showActionLoading("Next Episode Failed", err);
            return;
        }

        // If nothing changes, don't fail silently.
        window.setTimeout(() => {
            if (attemptId !== nextEpisodeAttemptId) return;
            if ($loading && currentVideoSrc === beforeSrc) {
                showActionLoading(
                    "Next Episode Failed",
                    "No new stream started. Please try again.",
                );
            }
        }, 10000);
    };

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
            (t) =>
                Session.performSeek(
                    t,
                    $duration,
                    $playbackOffset,
                    videoElem,
                    () => Session.captureFrame(videoElem, canvasElem),
                    () =>
                        Discord.updateDiscordActivity(
                            metaData,
                            season,
                            episode,
                            $duration,
                            $currentTime,
                            $isPlaying,
                        ),
                    $watchParty.isHost,
                    false,
                    $isPlaying,
                    WatchParty.updatePlaybackState,
                    {
                        setPendingSeek: pendingSeek.set,
                        setCurrentTime: currentTime.set,
                        setShowCanvas: showCanvas.set,
                        setIgnoreNextSeek: () => {},
                    },
                ),
            volume.set,
            seekFeedback.set,
            togglePlayWithFeedback,
        )}
/>

<div
    class="absolute inset-0 w-full h-full bg-black overflow-hidden group {$controlsVisible
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
            on:timeupdate={handleTimeUpdate}
            on:play={handlePlay}
            on:pause={handlePause}
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
                <svg
                    width="30"
                    height="30"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M15 19L8 12L15 5"
                        stroke="white"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
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
                    controlsManager.onSeekChange(e, $duration, (t) =>
                        Session.performSeek(
                            t,
                            $duration,
                            $playbackOffset,
                            videoElem,
                            () => Session.captureFrame(videoElem, canvasElem),
                            () =>
                                Discord.updateDiscordActivity(
                                    metaData,
                                    season,
                                    episode,
                                    $duration,
                                    $currentTime,
                                    $isPlaying,
                                ),
                            $watchParty.isHost,
                            false,
                            $isPlaying,
                            WatchParty.updatePlaybackState,
                            {
                                setPendingSeek: pendingSeek.set,
                                setCurrentTime: currentTime.set,
                                setShowCanvas: showCanvas.set,
                                setIgnoreNextSeek: () => {},
                            },
                        ),
                    )}
                onVolumeChange={(e) =>
                    controlsManager.onVolumeChange(e, volume.set)}
                toggleFullscreen={handleToggleFullscreen}
                objectFit={$objectFit}
                toggleObjectFit={handleToggleObjectFit}
                onNextEpisode={handleNextEpisodeClick}
                on:audioClick={openAudioSelection}
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
        onAudioSelect={(detail) => {
            trackEvent("audio_track_selected", {
                ...getPlaybackAnalyticsProps(),
                ...getTrackAnalyticsProps(detail, "audio"),
            });
            Session.handleAudioSelect(
                detail,
                $audioTracks,
                sessionId,
                hls,
                $currentTime,
                videoElem,
                (sid, t) =>
                    (hls = Session.initHLS(
                        videoElem,
                        sid,
                        t,
                        true,
                        Session.createSeekHandler(
                            videoElem,
                            () => hls,
                            sid,
                            () => $pendingSeek,
                            () => $seekGuard,
                            () => $playbackOffset,
                            () => $subtitleTracks,
                            () => $currentSubtitleLabel,
                            (tr) =>
                                Subtitles.handleSubtitleSelect(
                                    tr,
                                    videoElem,
                                    $currentTime,
                                    $playbackOffset,
                                    () => cueLinePercent,
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
                    )),
                {
                    setAudioTracks: audioTracks.set,
                    setCurrentAudioLabel: currentAudioLabel.set,
                },
            );
        }}
        onSubtitleSelect={(detail) => {
            trackEvent("subtitle_selected", {
                ...getPlaybackAnalyticsProps(),
                ...getTrackAnalyticsProps(detail, "subtitles"),
            });
            subtitleTracks.update((tracks) =>
                tracks.map((t) => ({
                    ...t,
                    selected: t.id === detail.id,
                })),
            );
            currentSubtitleLabel.set(detail.label);
            Subtitles.handleSubtitleSelect(
                detail,
                videoElem,
                $currentTime,
                $playbackOffset,
                () => cueLinePercent,
            );
        }}
        onSubtitleDelayChange={({ seconds }) => {
            trackEvent("subtitle_delay_changed", {
                ...getPlaybackAnalyticsProps(),
                delay_seconds: seconds,
            });
            // Delay is stored in Subtitles module; re-apply current subtitle to rebuild cues.
            const selected = $subtitleTracks.find((t) => t.selected);
            if (selected && selected.id !== "off") {
                Subtitles.handleSubtitleSelect(
                    selected,
                    videoElem,
                    $currentTime,
                    $playbackOffset,
                    () => cueLinePercent,
                );
            }
        }}
        onAddLocalSubtitle={(track) => {
            trackEvent("subtitle_local_added", {
                ...getPlaybackAnalyticsProps(),
                format: track?.format ?? null,
            });
            subtitleTracks.update((tracks) => {
                const next = tracks
                    .filter((t) => !(t.isLocal && String(t.id).startsWith("local:")))
                    .map((t) => ({ ...t, selected: false }));
                return [...next, { ...track, selected: true }];
            });
            currentSubtitleLabel.set(track.label);
            Subtitles.handleSubtitleSelect(
                track,
                videoElem,
                $currentTime,
                $playbackOffset,
                () => cueLinePercent,
            );
        }}
        onErrorRetry={() => {
            trackEvent("player_error_retry", getPlaybackAnalyticsProps());
            showError.set(false);
            errorMessage.set("");
            errorDetails.set("");
            if (videoSrc) loadVideo(videoSrc);
        }}
        onErrorBack={() => {
            trackEvent("player_error_back", getPlaybackAnalyticsProps());
            showError.set(false);
            handleClose();
        }}
        onCloseAudio={() => showAudioSelection.set(false)}
        onCloseSubtitle={() => showSubtitleSelection.set(false)}
        onCloseWatchParty={() => showWatchPartyModal.set(false)}
        initialPartyCode={joinPartyId}
        autoJoin={autoJoin}
        onFileSelected={(file) => {
            // If the user selects a file in the watch party modal, load it
            if (file && file.path) {
                loadVideo(file.path);
            }
        }}
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
</div>
