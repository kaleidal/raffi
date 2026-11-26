<script lang="ts">
    import { onDestroy, tick, untrack } from "svelte";
    import { get } from "svelte/store";
    import ShapeLoader from "../../../components/common/loading/ShapeLoader.svelte";
    import TrackSelectionModal from "../../../components/player/TrackSelectionModal.svelte";
    import { flushPendingLibraryProgress } from "../../../lib/db/db";
    import type { ShowResponse } from "../../../lib/library/types/meta_types";
    import { localMode } from "../../../lib/stores/authStore";
    import { autoSkipIntros } from "../../../lib/stores/playbackPreferences";
    import { router } from "../../../lib/stores/router";
    import { onBack } from "../../../lib/android/back";
    import { isTvPlatform } from "../../../lib/shell/platform";
    import { claimKeys } from "../../../lib/tv/keyClaims";
    import { moveFocusTo } from "../../../lib/tv/spatialNavigation";
    import * as NavigationLogic from "../../meta/navigationLogic";
    import * as ProgressLogic from "../../meta/progressLogic";
    import { progressMap, selectedStream } from "../../meta/metaState";
    import { reopenStreamsOnReturn } from "../../meta/streamLogic";
    import * as Chapters from "../chapters/chapters";
    import * as IntroDb from "../chapters/introdb";
    import PlayerLoadingScreen from "../components/PlayerLoadingScreen.svelte";
    import { loadingDetails, loadingProgress, loadingStage } from "../playerState";
    import { createTraktScrobbler } from "../integrations/traktScrobbleManager";
    import * as Subtitles from "../subtitles/subtitles";
    import type { Chapter, Track } from "../types";
    import AndroidPlayerControls from "./AndroidPlayerControls.svelte";
    import type AndroidSeekBar from "./AndroidSeekBar.svelte";
    import { createNativePlayback, explainNativeError, type NativePlaybackState } from "./nativePlayback";
    import { createLimboTorrentStream } from "./limboTorrent";
    import { audioTrackOptions, selectedLabel, subtitleChoice, subtitleTrackOptions } from "./tracks";
    import { findSubtitleInLanguage, readSubtitlePreference, rememberSubtitleChoice } from "../subtitles/subtitlePreference";

    let {
        videoSrc = null,
        embedSrc = null,
        metaData = null,
        startTime = 0,
        season = null,
        episode = null,
        fileIdx = null,
    }: {
        videoSrc?: string | null;
        embedSrc?: string | null;
        metaData?: ShowResponse | null;
        startTime?: number;
        season?: number | null;
        episode?: number | null;
        fileIdx?: number | null;
    } = $props();

    const CONTROLS_HIDE_MS = 4000;
    const INTRO_DB_STARTUP_BUDGET_MS = 1500;
    const MEDIA_KEY_SEEK_SECONDS = 30;

    const playback = createNativePlayback();
    const torrent = createLimboTorrentStream();
    const { state: playbackState, tracks, error } = playback;

    let sessionKey: string | null = null;
    let sessionRun = 0;
    let sourceError = $state<{ message: string; details: string } | null>(null);
    let hasStarted = $state(false);
    let ended = false;
    let playRequested = false;
    let introDbChapters = $state.raw<Chapter[]>([]);
    let addonSubtitles = $state.raw<Track[]>([]);
    let selectedAddonSubtitle = $state<Track["id"] | null>(null);
    let subtitlePreferenceApplied = $state(false);
    let lastAutoSkip: number | null = null;
    let controlsVisible = $state(false);
    let scrubbing = false;
    let trackModal = $state<"audio" | "subtitles" | null>(null);
    let fit = $state<"contain" | "cover">("contain");
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    let seekBar = $state<AndroidSeekBar | null>(null);
    let seekElement = $state<HTMLDivElement | null>(null);
    let controls = $state<AndroidPlayerControls | null>(null);
    let controlsPanel = $state<HTMLDivElement | null>(null);

    const imdbID = $derived(metaData?.meta?.imdb_id ?? null);
    const isSeries = $derived(metaData?.meta?.type === "series");
    const episodeInfo = $derived(
        isSeries
            ? metaData?.meta?.videos?.find((video) => video.season === season && (video.episode === episode || video.number === episode)) ?? null
            : null,
    );
    const title = $derived(metaData?.meta?.name ?? "Raffi");
    const subtitle = $derived(
        isSeries && season != null && episode != null
            ? [`S${season} E${episode}`, episodeInfo?.name].filter(Boolean).join(" · ")
            : null,
    );

    const chapterState = $derived(
        Chapters.checkChapters($playbackState.position, null, $playbackState.duration, metaData, introDbChapters),
    );
    const chapterMarkers = $derived(Chapters.getEffectiveChapterSegments(null, introDbChapters));
    const hasNextEpisode = $derived(isSeries && Boolean(episodeInfo) && metaData?.meta?.videos?.at(-1) !== episodeInfo);
    const nextEpisodeOffered = $derived(hasNextEpisode && chapterState.showNextEpisode);
    const nextEpisodeHighlighted = $derived(hasNextEpisode && chapterState.currentChapter?.kind === "outro");
    const skipLabel = $derived(chapterState.showSkipIntro ? chapterState.skipButtonLabel : null);

    const audioOptions = $derived(audioTrackOptions($tracks));
    const subtitleOptions = $derived(subtitleTrackOptions($tracks, addonSubtitles, selectedAddonSubtitle));

    const unsupportedReason = $derived(unsupportedSource(videoSrc, embedSrc));
    const blockingError = $derived(
        unsupportedReason
            ? { message: "This stream can't play on this device", details: unsupportedReason }
            : sourceError ?? ($error ? { message: "Playback stopped", details: explainNativeError($error) } : null),
    );

    const playbackKey = $derived([videoSrc, embedSrc, fileIdx, season, episode].join("|"));

    $effect(() => {
        if (!hasStarted) return;
        const chapter = chapterState.currentChapter;
        untrack(() => autoSkip(chapter));
    });

    $effect(() => {
        if (!subtitlePreferenceApplied) applySubtitlePreference(subtitleOptions);
    });

    $effect(() => {
        playback.setCaptionInset(
            controlsVisible && controlsPanel ? 1 - controlsPanel.getBoundingClientRect().top / innerHeight : 0,
        );
    });

    $effect(() => {
        const key = playbackKey;
        untrack(() => void startSession(key));
    });

    $effect(() => {
        const current = $playbackState;
        untrack(() => followPlayback(current));
    });

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
        subtitlePreferenceApplied = false;
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
        reopenStreamsOnReturn(imdbID);
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

    function showSubtitle(track: Track) {
        selectedAddonSubtitle = track.isAddon ? track.id : null;
        playback.selectSubtitle(subtitleChoice(track));
    }

    function selectSubtitle(track: Track) {
        subtitlePreferenceApplied = true;
        rememberSubtitleChoice(track);
        showSubtitle(track);
    }

    /** Starts each episode with subtitles the way the viewer last left them, once a matching track shows up. */
    function applySubtitlePreference(options: Track[]) {
        const preference = readSubtitlePreference();
        if (!preference || options.length < 2) return;
        const shown = options.find((track) => track.selected);
        const wanted = preference.enabled ? findSubtitleInLanguage(options, preference.lang) : options.find((track) => track.id === "off");
        if (!wanted) return;
        subtitlePreferenceApplied = true;
        if (wanted !== shown) showSubtitle(wanted);
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

<svelte:window onpointerdown={() => controlsVisible && scheduleHide()} />

<div class="fixed inset-0">
    {#if !isTvPlatform && hasStarted && !blockingError}
        <button
            class="absolute inset-0"
            aria-label={controlsVisible ? "Hide controls" : "Show controls"}
            onclick={() => (controlsVisible ? hideControls() : showControls())}
        ></button>
    {/if}

    {#if hasStarted && $playbackState.buffering && !blockingError}
        <div class="absolute inset-0 flex items-center justify-center">
            <ShapeLoader size="44px" class="opacity-80" />
        </div>
    {/if}

    {#if hasStarted && !blockingError}
        <AndroidPlayerControls
            bind:this={controls}
            bind:seekBar
            bind:seekElement
            bind:panel={controlsPanel}
            visible={controlsVisible}
            playback={$playbackState}
            {metaData}
            {season}
            {episode}
            chapters={chapterMarkers}
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
    {season}
    {episode}
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
