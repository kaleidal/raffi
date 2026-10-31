<script lang="ts">
    import { onDestroy, tick } from "svelte";
    import { get } from "svelte/store";
    import LoadingSpinner from "../../../components/common/LoadingSpinner.svelte";
    import TrackSelectionModal from "../../../components/player/TrackSelectionModal.svelte";
    import { flushPendingLibraryProgress } from "../../../lib/db/db";
    import type { ShowResponse } from "../../../lib/library/types/meta_types";
    import { localMode } from "../../../lib/stores/authStore";
    import { autoSkipIntros } from "../../../lib/stores/playbackPreferences";
    import { router } from "../../../lib/stores/router";
    import { onBack } from "../../../lib/tv/back";
    import { claimKeys } from "../../../lib/tv/keyClaims";
    import { moveFocusTo } from "../../../lib/tv/spatialNavigation";
    import * as NavigationLogic from "../../meta/navigationLogic";
    import * as ProgressLogic from "../../meta/progressLogic";
    import { progressMap, selectedStream, streamsPopupVisible } from "../../meta/metaState";
    import * as Chapters from "../chapters/chapters";
    import * as IntroDb from "../chapters/introdb";
    import PlayerLoadingScreen from "../components/PlayerLoadingScreen.svelte";
    import { loadingDetails, loadingProgress, loadingStage } from "../playerState";
    import { getSeekBarStyleFromStorage } from "../controls/seekStyle";
    import { createTraktScrobbler } from "../integrations/traktScrobbleManager";
    import * as Subtitles from "../subtitles/subtitles";
    import type { Chapter, Track } from "../types";
    import TvPlayerControls from "./TvPlayerControls.svelte";
    import type TvSeekBar from "./TvSeekBar.svelte";
    import { createNativePlayback, explainNativeError, type NativePlaybackState } from "./nativePlayback";
    import { createTvTorrentStream } from "./tvTorrent";
    import { audioTrackOptions, selectedLabel, subtitleChoice, subtitleTrackOptions } from "./tvTracks";

    export let videoSrc: string | null = null;
    export let embedSrc: string | null = null;
    export let metaData: ShowResponse | null = null;
    export let startTime = 0;
    export let season: number | null = null;
    export let episode: number | null = null;
    export let fileIdx: number | null = null;

    const CONTROLS_HIDE_MS = 4000;
    const INTRO_DB_STARTUP_BUDGET_MS = 1500;
    const MEDIA_KEY_SEEK_SECONDS = 30;

    const playback = createNativePlayback();
    const torrent = createTvTorrentStream();
    const { state: playbackState, tracks, error } = playback;
    const seekBarStyle = getSeekBarStyleFromStorage();

    let sessionKey: string | null = null;
    let sessionRun = 0;
    let sourceError: { message: string; details: string } | null = null;
    let hasStarted = false;
    let ended = false;
    let playRequested = false;
    let introDbChapters: Chapter[] = [];
    let addonSubtitles: Track[] = [];
    let selectedAddonSubtitle: Track["id"] | null = null;
    let lastAutoSkip: number | null = null;
    let controlsVisible = false;
    let scrubbing = false;
    let trackModal: "audio" | "subtitles" | null = null;
    let fit: "contain" | "cover" = "contain";
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    let seekBar: TvSeekBar | null = null;
    let seekElement: HTMLDivElement | null = null;
    let controls: TvPlayerControls | null = null;
    let controlsPanel: HTMLDivElement | null = null;

    $: imdbID = metaData?.meta?.imdb_id ?? null;
    $: isSeries = metaData?.meta?.type === "series";
    $: episodeInfo = isSeries
        ? metaData?.meta?.videos?.find((video) => video.season === season && (video.episode === episode || video.number === episode)) ?? null
        : null;
    $: title = metaData?.meta?.name ?? "Raffi";
    $: subtitle = isSeries && season != null && episode != null
        ? [`S${season} E${episode}`, episodeInfo?.name].filter(Boolean).join(" · ")
        : null;
    $: nowPlaying = metaData?.meta?.name
        ? isSeries && season != null && episode != null
            ? `${metaData.meta.name} S${season} E${episode}`
            : metaData.meta.name
        : null;

    $: chapterState = Chapters.checkChapters($playbackState.position, null, $playbackState.duration, metaData, introDbChapters);
    $: hasNextEpisode = isSeries && Boolean(episodeInfo) && metaData?.meta?.videos?.at(-1) !== episodeInfo;
    $: nextEpisodeOffered = hasNextEpisode && chapterState.showNextEpisode;
    $: nextEpisodeHighlighted = hasNextEpisode && chapterState.currentChapter?.kind === "outro";
    $: skipLabel = chapterState.showSkipIntro ? chapterState.skipButtonLabel : null;
    $: if (hasStarted) autoSkip(chapterState.currentChapter);

    $: audioOptions = audioTrackOptions($tracks);
    $: subtitleOptions = subtitleTrackOptions($tracks, addonSubtitles, selectedAddonSubtitle);

    $: unsupportedReason = unsupportedSource(videoSrc, embedSrc);
    $: blockingError = unsupportedReason
        ? { message: "This stream can't play on TV", details: unsupportedReason }
        : sourceError ??
          ($error ? { message: "Playback stopped", details: explainNativeError($error) } : null);

    $: playback.setCaptionInset(
        controlsVisible && controlsPanel ? 1 - controlsPanel.getBoundingClientRect().top / innerHeight : 0,
    );

    $: playbackKey = [videoSrc, embedSrc, fileIdx, season, episode].join("|");
    $: void startSession(playbackKey);
    $: followPlayback($playbackState);

    function unsupportedSource(source: string | null, embed: string | null) {
        if (embed) return "This source opens a provider's web player. Pick another stream.";
        if (!source) return "This stream has no playable link.";
        return null;
    }

    const createScrobbler = () =>
        createTraktScrobbler({
            isLocalMode: () => get(localMode),
            getImdbId: () => imdbID,
            getHasStarted: () => hasStarted,
            getMediaType: () => (isSeries ? "episode" : "movie"),
            getSeasonEpisode: () => ({ season, episode }),
            getProgress: () => {
                const { position, duration } = playback.current();
                return duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
            },
        });

    let traktScrobbler = createScrobbler();

    const introDbFor = (meta: ShowResponse | null, requestedSeason: number | null, requestedEpisode: number | null) =>
        meta?.meta?.type === "series"
            ? IntroDb.fetchIntroDbChapters(meta.meta.imdb_id, requestedSeason, requestedEpisode).catch(() => [])
            : Promise.resolve([]);

    async function startSession(key: string, resumeAt = startTime) {
        if (key === sessionKey) return;
        sessionKey = key;
        const run = ++sessionRun;

        stopScrobbling();
        traktScrobbler = createScrobbler();
        hasStarted = false;
        ended = false;
        playRequested = false;
        introDbChapters = [];
        addonSubtitles = [];
        selectedAddonSubtitle = null;
        lastAutoSkip = null;
        sourceError = null;
        hideControls();
        torrent.close();
        loadingStage.set("Loading");
        loadingDetails.set("");
        loadingProgress.set(null);
        const source = videoSrc;
        if (!source || unsupportedSource(source, embedSrc)) return;

        const request = introDbFor(metaData, season, episode);
        const playable = source.startsWith("magnet:") ? await openTorrent(source, run) : source;
        if (!playable || run !== sessionRun) return;

        const early = await Promise.race([
            request,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), INTRO_DB_STARTUP_BUDGET_MS)),
        ]);
        if (run !== sessionRun) return;
        if (early === null) {
            void request.then((chapters) => {
                if (run === sessionRun) introDbChapters = chapters;
            });
        }
        introDbChapters = early ?? [];

        const begin = Chapters.getStartupSkipTarget(
            resumeAt,
            Chapters.getEffectiveChapterSegments(null, introDbChapters),
            get(autoSkipIntros),
        );
        playback.load(playable, begin, subtitle ? `${title} ${subtitle}` : title);
        void Subtitles.fetchAddonSubtitles(metaData, season, episode).then((list) => {
            if (run === sessionRun) addonSubtitles = list;
        });
    }

    async function openTorrent(magnet: string, run: number) {
        const stream = get(selectedStream);
        const name = stream?.behaviorHints?.filename?.trim() || stream?.title?.trim() || stream?.name?.trim() || null;
        try {
            return await torrent.open(magnet, fileIdx, name);
        } catch (failure) {
            if (run === sessionRun) {
                sourceError = {
                    message: "Couldn't start this torrent",
                    details: failure instanceof Error ? failure.message : "Limbo couldn't stream this torrent.",
                };
            }
            return null;
        }
    }

    function followPlayback(current: NativePlaybackState) {
        if (!hasStarted) {
            if (!current.playing) return;
            hasStarted = true;
        }
        if (imdbID && current.duration > 0) {
            void ProgressLogic.handleProgress(current.position, current.duration, imdbID, true);
        }
        if (current.playWhenReady !== playRequested) {
            playRequested = current.playWhenReady;
            void traktScrobbler.send(playRequested ? "start" : "pause");
            if (!playRequested) showControls(() => controls?.playButton() ?? null);
        }
        if (current.ended && !ended) {
            ended = true;
            stopScrobbling();
            if (hasNextEpisode) void playNextEpisode();
            else close();
        }
    }

    function autoSkip(chapter: Chapter | null) {
        if (!Chapters.shouldAutoSkipChapter(chapter, $autoSkipIntros) || lastAutoSkip === chapter.startTime) return;
        lastAutoSkip = chapter.startTime;
        playback.seek(Chapters.skipLandingTime(chapter));
    }

    function stopScrobbling() {
        if (hasStarted && !traktScrobbler.isStopSent()) void traktScrobbler.send("stop", true);
    }

    function close() {
        if (imdbID) void flushPendingLibraryProgress(imdbID);
        stopScrobbling();
        if (!router.back()) router.navigate("home");
    }

    function returnToStreams() {
        streamsPopupVisible.set(true);
        close();
    }

    function retry() {
        const resumeAt = hasStarted ? playback.current().position : startTime;
        sessionKey = null;
        void startSession(playbackKey, resumeAt);
    }

    async function playNextEpisode() {
        if (!imdbID) return;
        stopScrobbling();
        await NavigationLogic.handleNextEpisode(imdbID, get(progressMap));
    }

    function skipChapter() {
        Chapters.skipChapter(chapterState.currentChapter, playback.seek);
    }

    function scheduleHide() {
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
            if (playback.current().playWhenReady && !scrubbing && !trackModal) hideControls();
            else scheduleHide();
        }, CONTROLS_HIDE_MS);
    }

    async function showControls(focusTarget?: () => HTMLElement | null) {
        controlsVisible = true;
        scheduleHide();
        if (!focusTarget) return;
        await tick();
        const target = focusTarget();
        if (target) moveFocusTo(target);
    }

    function hideControls() {
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = null;
        controlsVisible = false;
    }

    function toggleFit() {
        fit = fit === "contain" ? "cover" : "contain";
        playback.setFit(fit);
    }

    function selectSubtitle(track: Track) {
        selectedAddonSubtitle = track.isAddon ? track.id : null;
        playback.selectSubtitle(subtitleChoice(track));
    }

    async function startScrubbing(rightward: boolean) {
        await showControls(() => seekElement);
        seekBar?.nudge(rightward);
    }

    function claimHiddenKey(key: string) {
        switch (key) {
            case "ArrowLeft":
            case "ArrowRight":
                void startScrubbing(key === "ArrowRight");
                return true;
            case "Enter":
                if (skipLabel) skipChapter();
                else if (nextEpisodeOffered) void playNextEpisode();
                else {
                    playback.toggle();
                    void showControls(() => controls?.playButton() ?? null);
                }
                return true;
            case "ArrowUp":
            case "ArrowDown":
                void showControls(() => controls?.playButton() ?? null);
                return true;
            default:
                return false;
        }
    }

    function claimKey(event: KeyboardEvent) {
        if (trackModal || blockingError || !hasStarted) return false;
        const { position } = playback.current();
        switch (event.key) {
            case "MediaPlayPause":
                playback.toggle();
                return true;
            case "MediaPlay":
                playback.play();
                return true;
            case "MediaPause":
                playback.pause();
                return true;
            case "MediaFastForward":
                playback.seek(position + MEDIA_KEY_SEEK_SECONDS);
                void showControls();
                return true;
            case "MediaRewind":
                playback.seek(position - MEDIA_KEY_SEEK_SECONDS);
                void showControls();
                return true;
        }
        if (!controlsVisible) return claimHiddenKey(event.key);
        scheduleHide();
        return false;
    }

    const releaseKeys = claimKeys(claimKey);

    const removeBackHandler = onBack(() => {
        if (trackModal) trackModal = null;
        else if (controlsVisible && hasStarted && !blockingError) hideControls();
        else close();
        return true;
    });

    onDestroy(() => {
        releaseKeys();
        removeBackHandler();
        if (hideTimer) clearTimeout(hideTimer);
        playback.destroy();
        torrent.close();
    });
</script>

<div class="fixed inset-0">
    {#if hasStarted && $playbackState.buffering && !blockingError}
        <div class="absolute inset-0 flex items-center justify-center">
            <LoadingSpinner size="56px" color="#D8D8D8" />
        </div>
    {/if}

    {#if hasStarted && !blockingError}
        <TvPlayerControls
            bind:this={controls}
            bind:seekBar
            bind:seekElement
            bind:panel={controlsPanel}
            visible={controlsVisible}
            state={$playbackState}
            {metaData}
            {nowPlaying}
            chapters={Chapters.getEffectiveChapterSegments(null, introDbChapters)}
            {seekBarStyle}
            audioLabel={selectedLabel(audioOptions, "Audio")}
            subtitleLabel={selectedLabel(subtitleOptions, "Off")}
            {skipLabel}
            {hasNextEpisode}
            {nextEpisodeHighlighted}
            {fit}
            onToggle={playback.toggle}
            onSeek={playback.seek}
            onScrubbingChange={(value) => (scrubbing = value)}
            onClose={close}
            onSkip={skipChapter}
            onNextEpisode={() => void playNextEpisode()}
            onAudio={() => (trackModal = "audio")}
            onSubtitles={() => (trackModal = "subtitles")}
            onToggleFit={toggleFit}
        />
    {/if}
</div>

<PlayerLoadingScreen
    loading={!hasStarted || Boolean(blockingError)}
    onClose={close}
    {metaData}
    stage={$loadingStage}
    details={$loadingDetails}
    progress={$loadingProgress}
    backdropSrc={episodeInfo?.thumbnail ?? null}
    showError={Boolean(blockingError)}
    errorMessage={blockingError?.message ?? ""}
    errorDetails={blockingError?.details ?? ""}
    onRetry={retry}
    onBack={returnToStreams}
/>

{#if trackModal === "audio"}
    <TrackSelectionModal
        title="Audio"
        kind="audio"
        tracks={audioOptions}
        onSelect={(track) => playback.selectAudio(String(track.id))}
        onClose={() => (trackModal = null)}
    />
{:else if trackModal === "subtitles"}
    <TrackSelectionModal
        title="Subtitles"
        kind="subtitles"
        tracks={subtitleOptions}
        subtitleTools={false}
        onSelect={selectSubtitle}
        onClose={() => (trackModal = null)}
    />
{/if}
