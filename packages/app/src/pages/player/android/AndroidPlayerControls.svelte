<script lang="ts">
    import PlayerChrome from "../../../components/player/chrome/PlayerChrome.svelte";
    import type { PlayerControlsProps } from "../../../components/player/chrome/PlayerControls.svelte";
    import type { TrackOptions } from "../../../components/player/tracks/types";
    import type { ShowResponse } from "../../../lib/library/types/meta_types";
    import type { Chapter } from "../types";
    import AndroidSeekBar from "./AndroidSeekBar.svelte";
    import type { NativePlaybackState } from "./nativePlayback";

    let {
        visible = false,
        playback,
        metaData,
        season,
        episode,
        chapters = [],
        skipLabel,
        hasNextEpisode = false,
        nextEpisodeHighlighted = false,
        fit,
        panel = $bindable(null),
        seekBar = $bindable(null),
        seekElement = $bindable(null),
        onToggle,
        onSeek,
        onScrubbingChange,
        onClose,
        onSkip,
        onNextEpisode,
        tracks,
        tracksOpen,
        onTracksOpenChange,
        onToggleFit,
    }: {
        visible?: boolean;
        playback: NativePlaybackState;
        metaData: ShowResponse | null;
        season: number | null;
        episode: number | null;
        chapters?: Chapter[];
        skipLabel: string | null;
        hasNextEpisode?: boolean;
        nextEpisodeHighlighted?: boolean;
        fit: "contain" | "cover";
        panel?: HTMLDivElement | null;
        seekBar?: AndroidSeekBar | null;
        seekElement?: HTMLDivElement | null;
        onToggle: () => void;
        onSeek: (time: number) => void;
        onScrubbingChange: (scrubbing: boolean) => void;
        onClose: () => void;
        onSkip: () => void;
        onNextEpisode: () => void;
        tracks: TrackOptions;
        tracksOpen: boolean;
        onTracksOpenChange: (open: boolean) => void;
        onToggleFit: () => void;
    } = $props();

    let scrubTime = $state<number | null>(null);

    export function playButton() {
        return panel?.querySelector<HTMLElement>(".player-play-button") ?? null;
    }

    const buffered = $derived(playback.duration > 0 ? [{ start: 0, end: playback.buffered }] : []);

    const controls: PlayerControlsProps = $derived({
        isPlaying: playback.playWhenReady,
        duration: playback.duration,
        currentTime: playback.position,
        pendingSeek: scrubTime,
        volume: 1,
        chapterMarkers: chapters,
        buffered,
        visible,
        canDownload: false,
        tracks,
        tracksOpen,
        onTracksOpenChange,
        objectFit: fit,
        togglePlay: onToggle,
        onSeekInput: () => {},
        onSeekChange: onSeek,
        onVolumeChange: () => {},
        toggleFullscreen: () => {},
        toggleObjectFit: onToggleFit,
    });

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
    panelOpen={tracksOpen}
    bind:panel
    {controls}
>
    {#snippet seek()}
        <AndroidSeekBar
            bind:this={seekBar}
            bind:element={seekElement}
            time={playback.position}
            duration={playback.duration}
            {buffered}
            {chapters}
            onCommit={onSeek}
            onScrub={handleScrub}
        />
    {/snippet}
</PlayerChrome>
