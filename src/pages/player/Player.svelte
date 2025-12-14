<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import { router } from "../../lib/stores/router";
    import PlayerControls from "../../components/player/PlayerControls.svelte";
    import PlayerOverlays from "../../components/player/PlayerOverlays.svelte";
    import SeekFeedback from "../../components/player/SeekFeedback.svelte";
    import PlayerVideo from "./components/PlayerVideo.svelte";
    import PlayerLoadingScreen from "./components/PlayerLoadingScreen.svelte";
    import PlayerModals from "./components/PlayerModals.svelte";
    import PlayerWatchParty from "./components/PlayerWatchParty.svelte";
    import type { ShowResponse } from "../../lib/library/types/meta_types";
    import { watchParty } from "../../lib/stores/watchPartyStore";

    import {
        isPlaying,
        loading,
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

    const handleClose = () => {
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
    let reprobeAttempted = false;

    $: hasStartedStore.set(hasStarted);

    $: controlsManager = Controls.createControlsManager(
        playerContainer,
        videoElem,
        $watchParty.isActive,
        $watchParty.isHost,
    );

    onMount(() => {
        resetPlayerState();
        hasStarted = false;

        if (joinPartyId && autoJoin) {
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
        clearInterval(metadataCheckInterval);
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
            const result = await Session.loadVideoSession(
                src,
                fileIdx,
                startTime,
                {
                    setLoading: loading.set,
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

            await tick();
            if (!videoElem) return;

            Discord.updateDiscordActivity(
                metaData,
                season,
                episode,
                $duration,
                0,
                false,
            );

            hls = Session.initHLS(
                videoElem,
                sessionId,
                startTime,
                autoPlay,
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

            setTimeout(() => {
                if ($loading && !$hasStartedStore && !$isPlaying) {
                    loading.set(false);
                    showError.set(true);
                    errorMessage.set("Stream took too long to load");
                    errorDetails.set("Please try another stream.");
                }
            }, 30000);
        } catch (err) {
            console.error(err);
        }
    };

    const handleNextEpisodeClick = () => {
        if ($duration > 0 && $duration - $currentTime <= 600) {
            onProgress($duration, $duration);
        }
        onNextEpisode();
    };

    let controlsOverlayElem: HTMLElement | null = null;
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
            () => controlsManager.togglePlay(controlsVisible.set),
        )}
/>

<div
    class="fixed inset-0 w-screen h-screen bg-black overflow-hidden group {$controlsVisible
        ? 'cursor-default'
        : 'cursor-none'}"
    bind:this={playerContainer}
>
    <div class="w-full h-screen">
        <PlayerVideo
            bind:videoElem
            bind:canvasElem
            objectFit={$objectFit}
            showCanvas={$showCanvas}
            on:timeupdate={handleTimeUpdate}
            on:play={handlePlay}
            on:pause={handlePause}
            on:click={() => controlsManager.togglePlay(controlsVisible.set)}
            on:waiting={() => loading.set(true)}
            on:playing={() => loading.set(false)}
            on:canplay={() => loading.set(false)}
        />
    </div>

    {#if $seekFeedback}
        <SeekFeedback type={$seekFeedback.type} id={$seekFeedback.id} />
    {/if}

    <PlayerLoadingScreen loading={$loading} onClose={handleClose} {metaData} />

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
            class="absolute left-1/2 -translate-x-1/2 bottom-[50px] z-50 flex flex-col gap-[10px] transition-all duration-300 ease-in-out transform {$controlsVisible
                ? 'translate-y-0 opacity-100'
                : 'translate-y-10 opacity-0 pointer-events-none'}"
            bind:this={controlsOverlayElem}
        >
            <PlayerOverlays
                showSkipIntro={$showSkipIntro}
                showNextEpisode={$showNextEpisode}
                isWatchPartyMember={$watchParty.isActive && !$watchParty.isHost}
                skipChapter={() =>
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
                    )}
                nextEpisode={onNextEpisode}
            />
            <PlayerControls
                isPlaying={$isPlaying}
                duration={$duration}
                currentTime={$currentTime}
                pendingSeek={$pendingSeek}
                volume={$volume}
                controlsVisible={$controlsVisible}
                loading={$loading}
                {videoSrc}
                {metaData}
                currentAudioLabel={$currentAudioLabel}
                currentSubtitleLabel={$currentSubtitleLabel}
                isWatchPartyMember={$watchParty.isActive && !$watchParty.isHost}
                togglePlay={() =>
                    controlsManager.togglePlay(controlsVisible.set)}
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
                toggleFullscreen={controlsManager.toggleFullscreen}
                objectFit={$objectFit}
                toggleObjectFit={() =>
                    controlsManager.toggleObjectFit($objectFit, objectFit.set)}
                onNextEpisode={handleNextEpisodeClick}
                on:audioClick={() => showAudioSelection.set(true)}
                on:subtitleClick={() => showSubtitleSelection.set(true)}
                on:watchPartyClick={() => showWatchPartyModal.set(true)}
            />
        </div>
    {/if}

    <PlayerModals
        showAudioSelection={$showAudioSelection}
        showSubtitleSelection={$showSubtitleSelection}
        showError={$showError}
        showWatchPartyModal={$showWatchPartyModal}
        audioTracks={$audioTracks}
        subtitleTracks={$subtitleTracks}
        errorMessage={$errorMessage}
        errorDetails={$errorDetails}
        {metaData}
        {season}
        {episode}
        {videoSrc}
        {fileIdx}
        onAudioSelect={(detail) =>
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
            )}
        onSubtitleSelect={(detail) => {
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
            showError.set(false);
            errorMessage.set("");
            errorDetails.set("");
            if (videoSrc) loadVideo(videoSrc);
        }}
        onErrorBack={() => {
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
