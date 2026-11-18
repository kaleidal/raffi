<script lang="ts">
    import PlayerChrome from "../../../components/player/chrome/PlayerChrome.svelte";
    import type { ShowResponse } from "../../../lib/library/types/meta_types";
    import type { SeekBarStyle } from "../controls/seekStyle";
    import type { Chapter } from "../types";
    import AndroidSeekBar from "./AndroidSeekBar.svelte";
    import type { NativePlaybackState } from "./nativePlayback";

    export let visible = false;
    export let state: NativePlaybackState;
    export let metaData: ShowResponse | null;
    export let season: number | null;
    export let episode: number | null;
    export let chapters: Chapter[] = [];
    export let seekBarStyle: SeekBarStyle;
    export let audioLabel: string;
    export let subtitleLabel: string;
    export let skipLabel: string | null;
    export let hasNextEpisode = false;
    export let nextEpisodeHighlighted = false;
    export let fit: "contain" | "cover";
    export let panel: HTMLDivElement | null = null;
    export let seekBar: AndroidSeekBar | null = null;
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

    function handleScrub(time: number | null) {
        scrubTime = time;
        onScrubbingChange(time !== null);
    }
</script>

<PlayerChrome
    {visible}
    {metaData}
    {season}
    {episode}
    {skipLabel}
    {onSkip}
    {hasNextEpisode}
    {nextEpisodeHighlighted}
    {onNextEpisode}
    {onClose}
    bind:panel
    controls={{
        isPlaying: state.playWhenReady,
        duration: state.duration,
        currentTime: state.position,
        pendingSeek: scrubTime,
        volume: 1,
        seekBarStyle,
        chapterMarkers: chapters,
        buffered,
        visible,
        canDownload: false,
        currentAudioLabel: audioLabel,
        currentSubtitleLabel: subtitleLabel,
        objectFit: fit,
        togglePlay: onToggle,
        onSeekInput: () => {},
        onSeekChange: onSeek,
        onVolumeChange: () => {},
        toggleFullscreen: () => {},
        toggleObjectFit: onToggleFit,
        onAudioClick: onAudio,
        onSubtitleClick: onSubtitles,
    }}
>
    {#snippet seek()}
        <AndroidSeekBar
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
    {/snippet}
</PlayerChrome>
