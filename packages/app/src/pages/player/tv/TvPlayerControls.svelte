<script lang="ts">
    import { ChevronLeft, SkipForward } from "@lucide/svelte";
    import PlayerControls from "../../../components/player/PlayerControls.svelte";
    import PlayerOverlays from "../../../components/player/PlayerOverlays.svelte";
    import type { ShowResponse } from "../../../lib/library/types/meta_types";
    import type { SeekBarStyle } from "../controls/seekStyle";
    import type { Chapter } from "../types";
    import TvSeekBar from "./TvSeekBar.svelte";
    import type { NativePlaybackState } from "./nativePlayback";

    export let visible = false;
    export let state: NativePlaybackState;
    export let metaData: ShowResponse | null;
    export let nowPlaying: string | null;
    export let chapters: Chapter[] = [];
    export let seekBarStyle: SeekBarStyle;
    export let audioLabel: string;
    export let subtitleLabel: string;
    export let skipLabel: string | null;
    export let hasNextEpisode = false;
    export let nextEpisodeHighlighted = false;
    export let fit: "contain" | "cover";
    export let panel: HTMLDivElement | null = null;
    export let seekBar: TvSeekBar | null = null;
    export let seekElement: HTMLDivElement | null = null;

    export let onToggle: () => void;
    export let onSeek: (time: number) => void;
    export let onScrubbingChange: (scrubbing: boolean) => void;
    export let onClose: () => void;
    export let onSkip: () => void;
    export let onNextEpisode: () => void;
    export let onAudio: () => void;
    export let onSubtitles: () => void;
    export let onToggleFit: () => void;

    let scrubTime: number | null = null;

    export const playButton = () => panel?.querySelector<HTMLElement>(".player-play-button") ?? null;

    $: buffered = state.duration > 0 ? [{ start: 0, end: state.buffered }] : [];

    const slide = (shown: boolean, from: "top" | "bottom") =>
        shown ? "translate-y-0 opacity-100" : `${from === "top" ? "-translate-y-10" : "translate-y-10"} opacity-0`;

    const navButton = "flex size-[54px] items-center justify-center rounded-full transition-colors duration-200";

    function handleScrub(time: number | null) {
        scrubTime = time;
        onScrubbingChange(time !== null);
    }
</script>

<div class="absolute left-0 top-0 z-50 p-10 transition-all duration-300 ease-in-out {slide(visible, 'top')}" inert={!visible}>
    <button class="{navButton} bg-[#000000]/45" on:click={onClose} aria-label="Close player">
        <ChevronLeft size={26} color="white" strokeWidth={2} />
    </button>
</div>

{#if hasNextEpisode}
    <div
        class="absolute right-0 top-0 z-50 p-10 transition-all duration-300 ease-in-out {slide(visible || nextEpisodeHighlighted, 'top')}"
        inert={!visible}
    >
        <button
            class="{navButton} {nextEpisodeHighlighted
                ? 'scale-105 bg-white shadow-[0_0_0_4px_rgba(255,255,255,0.22),0_0_32px_rgba(255,255,255,0.5)]'
                : 'bg-[#000000]/45'}"
            on:click={onNextEpisode}
            aria-label="Next episode"
        >
            <SkipForward size={26} color={nextEpisodeHighlighted ? "black" : "white"} strokeWidth={2} />
        </button>
    </div>
{/if}

{#if nowPlaying}
    <div
        class="pointer-events-none absolute inset-x-28 top-10 z-50 flex h-[62px] items-center justify-center transition-all duration-300 ease-in-out {slide(visible, 'top')}"
    >
        <span class="inline-flex min-h-[62px] max-w-[40rem] items-center truncate rounded-full bg-[#000000]/45 px-8 text-[1.125rem] font-medium leading-6 text-white">
            {nowPlaying}
        </span>
    </div>
{/if}

<div class="absolute bottom-8 left-1/2 z-50 flex max-w-full -translate-x-1/2 flex-col gap-2.5">
    <PlayerOverlays showSkipIntro={Boolean(skipLabel)} skipLabel={skipLabel ?? ""} skipChapter={onSkip} />

    <div bind:this={panel} class="transition-all duration-300 ease-in-out {slide(visible, 'bottom')}" inert={!visible}>
        <PlayerControls
            isPlaying={state.playWhenReady}
            duration={state.duration}
            currentTime={state.position}
            pendingSeek={scrubTime}
            {seekBarStyle}
            chapterMarkers={chapters}
            {buffered}
            {visible}
            {metaData}
            currentAudioLabel={audioLabel}
            currentSubtitleLabel={subtitleLabel}
            objectFit={fit}
            showWatchParty={false}
            togglePlay={onToggle}
            onSeekInput={() => {}}
            onSeekChange={onSeek}
            onVolumeChange={() => {}}
            toggleFullscreen={() => {}}
            toggleObjectFit={onToggleFit}
            onAudioClick={onAudio}
            onSubtitleClick={onSubtitles}
        >
            <TvSeekBar
                slot="seek"
                bind:this={seekBar}
                bind:element={seekElement}
                time={state.position}
                duration={state.duration}
                {buffered}
                {chapters}
                inverted={seekBarStyle !== "normal"}
                onCommit={onSeek}
                onScrub={handleScrub}
            />
        </PlayerControls>
    </div>
</div>
