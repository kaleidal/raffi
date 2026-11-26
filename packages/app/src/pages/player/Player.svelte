<script lang="ts">
    import { onDestroy, onMount, untrack } from "svelte";
    import { router } from "../../lib/stores/router";
    import PlayerChrome from "../../components/player/chrome/PlayerChrome.svelte";
    import type { PlayerControlsProps } from "../../components/player/chrome/PlayerControls.svelte";
    import MiniPlayerControls from "../../components/player/MiniPlayerControls.svelte";
    import SeekFeedback from "../../components/player/SeekFeedback.svelte";
    import PlayPauseFeedback from "../../components/player/PlayPauseFeedback.svelte";
    import ShapeLoader from "../../components/common/loading/ShapeLoader.svelte";
    import PlayerVideo from "./components/PlayerVideo.svelte";
    import PlayerLoadingScreen from "./components/PlayerLoadingScreen.svelte";
    import PlayerModals from "./components/PlayerModals.svelte";
    import { flushPendingLibraryProgress } from "../../lib/db/db";
    import { miniPlayerOnMinimize } from "../../lib/stores/playbackPreferences";
    import { openExternal } from "../../lib/shell/openExternal";
    import { reopenStreamsOnReturn } from "../meta/streamLogic";
    import { selectedStream } from "../meta/metaState";

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
        hasStarted as hasStartedStore,
        currentChapter,
        resetPlayerState,
    } from "./playerState";

    import * as Session from "./session/videoSession";
    import * as Controls from "./controls/playerControls";
    import * as Chapters from "./chapters/chapters";
    import * as Discord from "./integrations/discord";
    import { followMediaSession } from "./integrations/systemMediaControls.svelte";
    import { createPlaybackReporting } from "./integrations/playbackReporting";
    import { persistControlsPinned, readControlsPinned } from "./controls/playerPreferences";
    import { createSeekTimeline } from "./controls/seekTimeline.svelte";
    import { hasNextEpisode as seriesHasNextEpisode } from "./controls/playerNextEpisode";
    import { createNextEpisodeFlow } from "./controls/nextEpisodeFlow";
    import { createPlayerModalHandlers } from "./controls/playerModalHandlers";
    import { isSamePlaybackSource } from "./session/prefetch/nextEpisodePrefetch";
    import { captureBackdrop, episodeArtwork, type LoadingBackdrop } from "./session/loadingBackdrop";
    import { createCuePositioning } from "./subtitles/cuePositioning.svelte";
    import { PlayerMedia } from "./lifecycle/playerMedia.svelte";
    import { createMiniPlayer } from "./lifecycle/miniPlayer.svelte";
    import { createPlaybackEvents } from "./lifecycle/playbackEvents";
    import { createPlayerSession, type PlayerRoute } from "./lifecycle/playerSession";
    import type { Chapter } from "./types";

    let {
        videoSrc = null,
        embedSrc = null,
        fileIdx = null,
        metaData = null,
        startTime = 0,
        season = null,
        episode = null,
        streamAvailability = null,
    }: Partial<PlayerRoute> = $props();

    const imdbID = untrack(() => metaData?.meta?.imdb_id || null);
    const DESKTOP_DOWNLOAD_URL = "https://raffi.al/#download";

    const media = new PlayerMedia();
    let playerContainer = $state<HTMLDivElement>();
    let controlsPanel = $state<HTMLDivElement | null>(null);
    let hasStarted = $state(false);
    let introDbChapters = $state.raw<Chapter[]>([]);
    let skipButtonLabel = $state("Skip Intro");
    let isTearingDown = false;
    let loadingBackdrop = $state.raw<LoadingBackdrop>({ src: null, mode: "art" });
    let pictureAspect = $state<number | null>(null);
    let clipEditorOpen = $state(false);
    let controlsPinned = $state(readControlsPinned());
    let playPauseFeedback = $state.raw<{ type: "play" | "pause"; id: number } | null>(null);
    let playPauseFeedbackTimeout: ReturnType<typeof setTimeout> | null = null;

    const hasNextEpisode = $derived(seriesHasNextEpisode(metaData, season, episode));
    const bingeNextSupported = $derived(metaData?.meta?.type === "series" && Boolean($selectedStream?.behaviorHints?.bingeGroup));
    const nextEpisodePrefetchWindow = $derived(Chapters.getNextEpisodePrefetchWindow($duration, $sessionData, introDbChapters));
    const nextEpisodeHighlighted = $derived($currentChapter?.kind === "outro");
    const controlsManager = $derived(Controls.createControlsManager(playerContainer ?? null, media.video ?? null));
    const effectiveChapterMarkers = $derived(Chapters.getEffectiveChapterSegments($sessionData, introDbChapters));

    const mediaContext = () => ({ metaData, season, episode });
    const reporting = createPlaybackReporting({ imdbId: imdbID, hasStarted: () => hasStarted, getMediaContext: mediaContext });
    const { stopTrakt } = reporting;

    let fullscreenExited = false;
    const leaveFullscreen = async () => {
        if (fullscreenExited) return;
        fullscreenExited = true;
        await Controls.exitFullscreen();
    };

    const handleClose = async () => {
        miniPlayer.exit();
        if (imdbID) void flushPendingLibraryProgress(imdbID);
        stopTrakt();
        await leaveFullscreen();
        void session.cancelLoad();
        if (!router.back()) router.navigate("home");
    };

    const returnToStreams = () => {
        reopenStreamsOnReturn(imdbID);
        void handleClose();
    };

    const captureLoadingBackdrop = () => {
        loadingBackdrop = hasStarted
            ? captureBackdrop(media.video, media.canvas, loadingBackdrop)
            : episodeArtwork(metaData, season, episode);
    };

    const seekToTime = (targetTime: number) => {
        const { video, canvas } = media;
        if (!video) return;
        captureLoadingBackdrop();
        Session.performSeek({
            targetTime,
            duration: $duration,
            videoElem: video,
            captureFrame: () => Session.captureFrame(video, canvas ?? null),
            onAfterSeek: () => {
                if (hasStarted) Discord.updateDiscordActivity(metaData, season, episode, $duration, $currentTime, $isPlaying);
            },
            setPendingSeek: pendingSeek.set,
            setCurrentTime: currentTime.set,
            setShowCanvas: showCanvas.set,
            hasPlaybackController: Boolean(media.controller),
        });
    };

    const togglePlayWithFeedback = () => {
        const video = media.video;
        if (!video) return;
        if (playPauseFeedbackTimeout) clearTimeout(playPauseFeedbackTimeout);
        playPauseFeedback = { type: video.paused ? "play" : "pause", id: Date.now() };
        playPauseFeedbackTimeout = setTimeout(() => (playPauseFeedback = null), 450);
        controlsManager.togglePlay(controlsVisible.set);
    };

    const togglePlaybackFromMiniPlayer = () => {
        const video = media.video;
        if (!video) return;
        if (video.paused) void video.play();
        else video.pause();
    };

    const nextEpisode = createNextEpisodeFlow({
        imdbId: imdbID,
        getIdleVideo: () => media.idle(),
        reportProgress: reporting.reportProgress,
        getVideoSrc: () => videoSrc,
        setCurrentVideoSrc: (value) => (media.src = value),
        chapters: {
            getMetaData: () => metaData,
            getIntroDbChapters: () => introDbChapters,
            prepareSeek: (time) => media.controller?.prepareSeek(time),
            isBingeSupported: () => bingeNextSupported,
            hasNextEpisode: () => hasNextEpisode,
            getPrefetchWindow: () => nextEpisodePrefetchWindow,
            seekTo: seekToTime,
            setSkipLabel: (label) => (skipButtonLabel = label),
        },
    });
    const { playNext: handleNextEpisodeClick, chapters: chapterAutomation } = nextEpisode;

    const session = createPlayerSession({
        media,
        route: () => ({ videoSrc, embedSrc, fileIdx, metaData, startTime, season, episode, streamAvailability }),
        redirect: (src) => (videoSrc = src),
        imdbId: imdbID,
        prefetch: nextEpisode.prefetch,
        hasStarted: () => hasStarted,
        setHasStarted: (value) => (hasStarted = value),
        setIntroDbChapters: (chapters) => (introDbChapters = chapters),
        getCueLinePercent: () => cues.linePercent,
        showArtwork: () => (loadingBackdrop = episodeArtwork(metaData, season, episode)),
        resetForNewSource: () => {
            introDbChapters = [];
            skipButtonLabel = "Skip Intro";
            hasStarted = false;
            chapterAutomation.reset();
        },
        cancelNextEpisode: handleNextEpisodeClick.cancel,
        close: () => void handleClose(),
    });
    const { health: playbackHealth, embed: embedPlayback, transitions } = session;
    const healthPromptVisible = playbackHealth.promptVisible;
    const availabilityNoticeVisible = session.preflight.noticeVisible;

    const modalHandlers = createPlayerModalHandlers({
        getVideoElem: () => media.video,
        getCueLinePercent: () => cues.linePercent,
        getVideoSrc: () => videoSrc,
        loadVideo: (src) => (src === media.src ? transitions.reload() : session.loadVideo(src)),
        handleClose,
        getPlaybackController: () => media.controller,
    });

    const playbackEvents = createPlaybackEvents({
        getVideo: () => media.video,
        isTearingDown: () => isTearingDown,
        getMediaContext: mediaContext,
        hasStarted: () => hasStarted,
        onStarted: (video) => {
            hasStarted = true;
            pictureAspect = video.videoHeight ? video.videoWidth / video.videoHeight : null;
        },
        reporting,
        chapters: chapterAutomation,
        stopTorrentPolling: session.stopTorrentPolling,
        health: playbackHealth,
        guard: session.guard,
        captureLoadingBackdrop,
        reload: transitions.reload,
    });

    const miniPlayer = createMiniPlayer({
        isEnabled: () => $miniPlayerOnMinimize && $router.page === "player",
        hasPlayback: () => Boolean(videoSrc && !$showError),
        isPlaying: () => $isPlaying,
    });

    const cues = createCuePositioning({
        getContainer: () => playerContainer,
        getPanel: () => controlsPanel,
        getVideo: () => media.video,
        isControlsVisible: () => $controlsVisible,
    });

    const seekTimeline = createSeekTimeline({
        getVideo: () => media.video,
        getPreviewSource: () => ($sessionData?.isDirectHttp ? $sessionData.sourceUrl : null),
    });

    const seekWithMediaKeys = (time: number) => seekToTime(Math.max(0, Math.min(time, $duration)));
    followMediaSession({
        getMediaContext: mediaContext,
        getControls: () => ({
            togglePlay: togglePlayWithFeedback,
            seekTo: seekWithMediaKeys,
            seekBy: (seconds) => seekWithMediaKeys($currentTime + seconds),
            nextEpisode: hasNextEpisode ? handleNextEpisodeClick : null,
        }),
    });

    const chromeControls: PlayerControlsProps | null = $derived(
        embedSrc
            ? null
            : {
                  isPlaying: $isPlaying,
                  duration: $duration,
                  currentTime: $currentTime,
                  pendingSeek: $pendingSeek,
                  volume: $volume,
                  chapterMarkers: effectiveChapterMarkers,
                  seekPreview: seekTimeline.preview,
                  buffered: seekTimeline.buffered,
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
                  toggleObjectFit: () => Controls.switchObjectFit(media.video, media.canvas),
                  onAudioClick: () => showAudioSelection.set(true),
                  onSubtitleClick: () => showSubtitleSelection.set(true),
                  onClipEditorOpenChange: (open) => (clipEditorOpen = open),
                  pinned: controlsPinned,
                  onTogglePin: () => persistControlsPinned((controlsPinned = !controlsPinned)),
              },
    );

    $effect.pre(() => {
        hasStartedStore.set(hasStarted);
    });

    $effect(() => {
        controlsManager.setPinned(clipEditorOpen || controlsPinned, controlsVisible.set);
    });

    $effect(() => {
        if (media.video) media.video.muted = false;
    });

    $effect(() => {
        if ($loading && !hasStarted) loadingBackdrop = episodeArtwork(metaData, season, episode);
    });

    $effect(() => {
        if (!$showError) return;
        Discord.clearDiscordActivity();
        loading.set(false);
        loadingStage.set("");
        loadingDetails.set("");
        loadingProgress.set(null);
        playbackBuffering.set(false);
    });

    $effect(() => {
        if ($availabilityNoticeVisible) Discord.clearDiscordActivity();
    });

    $effect(() => {
        const src = embedSrc;
        if (src) untrack(() => transitions.toEmbed(src));
    });

    $effect(() => {
        if (!videoSrc || isSamePlaybackSource(videoSrc, fileIdx, media.src, media.fileIdx)) return;
        const source = { src: videoSrc, fileIdx };
        untrack(() => session.preflight.request(source));
    });

    $effect(() => {
        miniPlayer.active;
        untrack(cues.measure);
    });

    onMount(() => {
        resetPlayerState();
        return playbackEvents.watchMetadata();
    });

    onDestroy(() => {
        isTearingDown = true;
        if (imdbID) void flushPendingLibraryProgress(imdbID);
        stopTrakt();
        void leaveFullscreen();
        if (playPauseFeedbackTimeout) clearTimeout(playPauseFeedbackTimeout);
        session.dispose();
        resetPlayerState();
    });
</script>

<svelte:window
    onmessage={embedPlayback.handleMessage}
    onmousemove={(event) => controlsManager.handleMouseMove(controlsVisible.set, Boolean(controlsPanel?.contains(event.target as Node)))}
    onresize={cues.measure}
    onkeydown={(e) =>
        controlsManager.handleKeydown(e, $currentTime, $duration, $volume, seekToTime, volume.set, seekFeedback.set, togglePlayWithFeedback)}
/>

<div
    class="group fixed inset-0 z-100 h-full w-full overflow-hidden bg-black {$controlsVisible ? 'cursor-default' : 'cursor-none'}"
    bind:this={playerContainer}
    onmouseleave={() => controlsManager.resetHideTimer(controlsVisible.set)}
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
                onload={embedPlayback.loaded}
            ></iframe>
        {:else}
            <PlayerVideo
                bind:videoA={media.surfaceA}
                bind:videoB={media.surfaceB}
                activeSurface={media.activeSurface}
                bind:canvasElem={media.canvas}
                objectFit={$objectFit}
                showCanvas={$showCanvas}
                onTimeUpdate={() => {
                    playbackEvents.timeUpdate();
                    seekTimeline.refreshBuffered();
                }}
                onProgress={seekTimeline.refreshBuffered}
                onPlay={playbackEvents.play}
                onPause={playbackEvents.pause}
                onEnded={playbackEvents.ended}
                onClick={() => !miniPlayer.active && togglePlayWithFeedback()}
                onWaiting={playbackEvents.waiting}
                onPlaying={playbackEvents.playing}
                onCanPlay={playbackEvents.canPlay}
                onError={session.guard.handleVideoError}
            />
        {/if}
    </div>

    {#if playPauseFeedback && !embedSrc}
        <PlayPauseFeedback type={playPauseFeedback.type} id={playPauseFeedback.id} />
    {/if}

    {#if miniPlayer.active && !embedSrc}
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
        loading={$loading && !miniPlayer.active}
        onClose={handleClose}
        {metaData}
        {season}
        {episode}
        backdropSrc={loadingBackdrop.src}
        backdropMode={loadingBackdrop.mode}
        stage={$loadingStage}
        details={$loadingDetails}
        progress={$loadingProgress}
        showError={$showError && !hasStarted && !miniPlayer.active}
        errorMessage={$errorMessage}
        errorDetails={$errorDetails}
        onRetry={() => session.retry(modalHandlers.onErrorRetry)}
        onBack={modalHandlers.onErrorBack}
        onDownloadDesktop={() => void openExternal(DESKTOP_DOWNLOAD_URL)}
        showNotice={$availabilityNoticeVisible && !miniPlayer.active}
        noticeTitle="Not available on demand"
        noticeDetails="{streamAvailability?.providerLabel || 'Your debrid provider'} is still preparing this source. Check your dashboard, then try again once it's cached."
        noticePrimaryLabel="Back to Streams"
        noticeSecondaryLabel={streamAvailability?.dashboardUrl ? "Open Dashboard" : ""}
        onNoticePrimary={returnToStreams}
        onNoticeSecondary={() => streamAvailability?.dashboardUrl && void openExternal(streamAvailability.dashboardUrl)}
    />

    {#if $playbackBuffering && !$loading && !miniPlayer.active && !embedSrc}
        <div class="pointer-events-none absolute inset-0 z-40 flex items-center justify-center" aria-label="Buffering">
            <ShapeLoader size="44px" class="opacity-80" />
        </div>
    {/if}

    {#if !$loading && !miniPlayer.active}
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
            clipping={clipEditorOpen}
            bind:panel={controlsPanel}
            controls={chromeControls}
        />
    {/if}

    <PlayerModals
        showAudioSelection={$showAudioSelection}
        showSubtitleSelection={$showSubtitleSelection}
        showError={$showError && (hasStarted || miniPlayer.active)}
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
        onDownloadDesktop={() => void openExternal(DESKTOP_DOWNLOAD_URL)}
        onCloseAudio={modalHandlers.onCloseAudio}
        onCloseSubtitle={modalHandlers.onCloseSubtitle}
    />
</div>
