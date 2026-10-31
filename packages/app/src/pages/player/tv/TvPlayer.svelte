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
    import { progressMap, streamsPopupVisible } from "../../meta/metaState";
    import * as Chapters from "../chapters/chapters";
    import * as IntroDb from "../chapters/introdb";
    import PlayerLoadingScreen from "../components/PlayerLoadingScreen.svelte";
    import { getSeekBarStyleFromStorage } from "../controls/seekStyle";
    import { createTraktScrobbler } from "../integrations/traktScrobbleManager";
    import * as Subtitles from "../subtitles/subtitles";
    import type { Chapter, Track } from "../types";
    import TvPlayerControls from "./TvPlayerControls.svelte";
    import type TvSeekBar from "./TvSeekBar.svelte";
    import { createNativePlayback, explainNativeError, type NativePlaybackState } from "./nativePlayback";
    import { audioTrackOptions, selectedLabel, subtitleChoice, subtitleTrackOptions } from "./tvTracks";

    export let videoSrc: string | null = null;
    export let embedSrc: string | null = null;
    export let metaData: ShowResponse | null = null;
    export let startTime = 0;
    export let season: number | null = null;
    export let episode: number | null = null;

    const CONTROLS_HIDE_MS = 4000;
    const INTRO_DB_STARTUP_BUDGET_MS = 1500;
    const MEDIA_KEY_SEEK_SECONDS = 30;

    const playback = createNativePlayback();
    const { state: playbackState, tracks, error } = playback;
    const invertedSeek = getSeekBarStyleFromStorage() === "raffi";

    let sessionKey: string | null = null;
    let sessionRun = 0;
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
    let playButton: HTMLButtonElement | null = null;
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

    $: chapterState = Chapters.checkChapters($playbackState.position, null, $playbackState.duration, metaData, introDbChapters);
    $: hasNextEpisode = isSeries && Boolean(episodeInfo) && metaData?.meta?.videos?.at(-1) !== episodeInfo;
    $: nextEpisodeOffered = hasNextEpisode && chapterState.showNextEpisode;
    $: skipLabel = chapterState.showSkipIntro ? chapterState.skipButtonLabel : null;
    $: if (hasStarted) autoSkip(chapterState.currentChapter);

    $: audioOptions = audioTrackOptions($tracks);
    $: subtitleOptions = subtitleTrackOptions($tracks, addonSubtitles, selectedAddonSubtitle);

    $: unsupportedReason = unsupportedSource(videoSrc, embedSrc);
    $: blockingError = unsupportedReason
        ? { message: "This stream can't play on TV", details: unsupportedReason }
        : $error
          ? { message: "Playback stopped", details: explainNativeError($error) }
          : null;

    $: playback.setCaptionInset(controlsPanel ? 1 - controlsPanel.getBoundingClientRect().top / innerHeight : 0);

    $: void startSession(videoSrc, embedSrc);
    $: followPlayback($playbackState);

    function unsupportedSource(source: string | null, embed: string | null) {
        if (embed) return "This source opens a provider's web player. Pick another stream.";
        if (!source) return "This stream has no playable link.";
        if (source.startsWith("magnet:")) return "Torrent streams don't play on TV yet. Pick a debrid or direct link.";
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

    async function startSession(source: string | null, embed: string | null, resumeAt = startTime) {
        const key = `${source}|${embed}`;
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
        hideControls();
        if (!source || unsupportedSource(source, embed)) return;

        const request = introDbFor(metaData, season, episode);
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
        playback.load(source, begin, subtitle ? `${title} ${subtitle}` : title);
        void Subtitles.fetchAddonSubtitles(metaData, season, episode).then((list) => {
            if (run === sessionRun) addonSubtitles = list;
        });
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
            if (!playRequested) showControls(() => playButton);
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
        void startSession(videoSrc, embedSrc, resumeAt);
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
                    void showControls(() => playButton);
                }
                return true;
            case "ArrowUp":
            case "ArrowDown":
                void showControls(() => playButton);
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
    });
</script>

<div class="fixed inset-0">
    {#if hasStarted && $playbackState.buffering && !blockingError}
        <div class="absolute inset-0 flex items-center justify-center">
            <LoadingSpinner size="56px" color="#D8D8D8" />
        </div>
    {/if}

    {#if hasStarted && !controlsVisible && !blockingError && (skipLabel || nextEpisodeOffered)}
        <div class="absolute bottom-[var(--raffi-page-gutter)] right-[var(--raffi-page-gutter)] rounded-full bg-white px-7 py-3.5 font-poppins text-lg font-semibold text-black">
            {skipLabel ?? "Next Episode"}
        </div>
    {/if}

    {#if controlsVisible && hasStarted && !blockingError}
        <TvPlayerControls
            bind:seekBar
            bind:seekElement
            bind:playButton
            bind:panel={controlsPanel}
            {title}
            {subtitle}
            state={$playbackState}
            chapters={Chapters.getEffectiveChapterSegments(null, introDbChapters)}
            {invertedSeek}
            audioLabel={selectedLabel(audioOptions, "Audio")}
            subtitleLabel={selectedLabel(subtitleOptions, "Off")}
            {skipLabel}
            hasNextEpisode={nextEpisodeOffered}
            {fit}
            onToggle={playback.toggle}
            onSeek={playback.seek}
            onScrubbingChange={(value) => (scrubbing = value)}
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
    stage="Loading"
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
