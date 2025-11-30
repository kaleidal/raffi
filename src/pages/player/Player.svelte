<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
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

    // Local refs
    let videoElem: HTMLVideoElement;
    let playerContainer: HTMLDivElement;
    let canvasElem: HTMLCanvasElement;
    let hls: any = null;
    let sessionId: string;
    let currentVideoSrc: string | null = null;

    // Sync hasStarted prop
    $: hasStartedStore.set(hasStarted);

    // Initialize controls manager
    $: controlsManager = Controls.createControlsManager(
        playerContainer,
        videoElem,
        $watchParty.isActive,
        $watchParty.isHost,
    );

    // Lifecycle
    onMount(() => {
        resetPlayerState();
        hasStarted = false;

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
    });

    onDestroy(() => {
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

    // Event Handlers
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
                            () => Subtitles.getCurrentCueLine($controlsVisible),
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

            // Timeout check
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

    $: Subtitles.updateCuePositions(videoElem, $controlsVisible);
</script>

<svelte:window
    on:mousemove={() => controlsManager.handleMouseMove(controlsVisible.set)}
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
        />
    </div>

    {#if $seekFeedback}
        <SeekFeedback type={$seekFeedback.type} id={$seekFeedback.id} />
    {/if}

    <PlayerLoadingScreen loading={$loading} {onClose} {metaData} />

    {#if !$loading}
        <div
            class="absolute left-0 top-0 p-10 z-50 transition-all duration-300 ease-in-out transform {$controlsVisible
                ? 'translate-y-0 opacity-100'
                : '-translate-y-10 opacity-0 pointer-events-none'}"
        >
            <button
                class="bg-[#000000]/20 backdrop-blur-md hover:bg-[#FFFFFF]/20 transition-colors duration-200 rounded-full p-4 cursor-pointer"
                on:click={onClose}
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
        >
            <PlayerOverlays
                showSkipIntro={$showSkipIntro}
                showNextEpisode={$showNextEpisode}
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
                                    () =>
                                        Subtitles.getCurrentCueLine(
                                            $controlsVisible,
                                        ),
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
                () => Subtitles.getCurrentCueLine($controlsVisible),
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
            onClose();
        }}
        onCloseAudio={() => showAudioSelection.set(false)}
        onCloseSubtitle={() => showSubtitleSelection.set(false)}
        onCloseWatchParty={() => showWatchPartyModal.set(false)}
    />

    <PlayerWatchParty
        showPartyEndModal={$showPartyEndModal}
        partyEndReason={$partyEndReason}
        onContinue={() => showPartyEndModal.set(false)}
        onLeave={() => {
            showPartyEndModal.set(false);
            onClose();
        }}
    />
</div>
