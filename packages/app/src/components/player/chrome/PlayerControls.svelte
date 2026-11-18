<script lang="ts" module>
    import type { Chapter } from "../../../pages/player/types";
    import type { SeekPreview } from "../../../lib/media/preview/seekPreview";
    import type { TimeRange } from "../seek/seekTrack";

    export type PlayerControlsProps = {
        isPlaying: boolean;
        duration: number;
        currentTime: number;
        pendingSeek: number | null;
        volume: number;
        chapterMarkers: Chapter[];
        seekPreview?: SeekPreview | null;
        buffered: TimeRange[];
        visible: boolean;
        videoSrc?: string | null;
        canDownload: boolean;
        currentAudioLabel: string;
        currentSubtitleLabel: string;
        objectFit: "contain" | "cover";
        togglePlay: () => void;
        onSeekInput: (time: number) => void;
        onSeekChange: (time: number) => void;
        onVolumeChange: (volume: number) => void;
        toggleFullscreen: () => void;
        toggleObjectFit: () => void;
        onAudioClick: () => void;
        onSubtitleClick: () => void;
        onClipPanelOpenChange?: (open: boolean) => void;
    };
</script>

<script lang="ts">
    import type { Snippet } from "svelte";
    import { AudioLines, Download, Maximize, Scissors, Subtitles, ZoomIn, ZoomOut } from "@lucide/svelte";
    import { isAndroidPlatform } from "../../../lib/shell/platform";
    import { formatTime } from "../../../lib/utils/time";
    import { persistShowRemaining, readShowRemaining } from "../../../pages/player/controls/timeDisplay";
    import ClipPanel from "../clip/ClipPanel.svelte";
    import PlayPauseIcon from "../PlayPauseIcon.svelte";
    import SeekBar from "../seek/SeekBar.svelte";
    import PlayerButton from "./PlayerButton.svelte";
    import VolumeControl from "./VolumeControl.svelte";

    let {
        isPlaying,
        duration,
        currentTime,
        pendingSeek,
        volume,
        chapterMarkers,
        seekPreview = null,
        buffered,
        visible,
        videoSrc = null,
        canDownload,
        currentAudioLabel,
        currentSubtitleLabel,
        objectFit,
        togglePlay,
        onSeekInput,
        onSeekChange,
        onVolumeChange,
        toggleFullscreen,
        toggleObjectFit,
        onAudioClick,
        onSubtitleClick,
        onClipPanelOpenChange = () => {},
        seek,
    }: PlayerControlsProps & { seek?: Snippet } = $props();

    let clipPanelOpen = $state(false);

    const displayedTime = $derived(pendingSeek ?? currentTime);
    let showRemaining = $state(readShowRemaining());

    function toggleRemaining() {
        showRemaining = !showRemaining;
        persistShowRemaining(showRemaining);
    }

    function setClipPanelOpen(open: boolean) {
        clipPanelOpen = open;
        onClipPanelOpenChange(open);
    }
</script>

<div class="flex w-full flex-col gap-[clamp(4px,0.5vw,10px)]">
    <div class="flex items-center gap-[clamp(12px,1vw,20px)]">
        <span class="player-time text-left font-medium text-ink/80 tabular-nums">
            {formatTime(displayedTime)}
        </span>
        <div class="min-w-0 flex-1">
            {#if seek}
                {@render seek()}
            {:else}
                <SeekBar
                    {duration}
                    time={displayedTime}
                    chapters={chapterMarkers}
                    {buffered}
                    {seekPreview}
                    {visible}
                    onScrub={onSeekInput}
                    onCommit={onSeekChange}
                />
            {/if}
        </div>
        <button
            class="player-time cursor-pointer text-right font-medium text-ink/80 tabular-nums transition-colors hover:text-ink"
            aria-label={showRemaining ? "Show total time" : "Show time left"}
            onclick={toggleRemaining}
        >
            {showRemaining ? `-${formatTime(Math.max(0, duration - displayedTime))}` : formatTime(duration)}
        </button>
    </div>

    <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-[clamp(6px,0.6vw,12px)]">
            <button
                class="player-play-button shrink-0 cursor-pointer rounded-full text-ink transition-[opacity,scale] duration-150 hover:opacity-85 active:scale-92"
                aria-label={isPlaying ? "Pause" : "Play"}
                onclick={togglePlay}
            >
                <PlayPauseIcon playing={isPlaying} />
            </button>
            {#if !isAndroidPlatform}
                <VolumeControl {volume} onChange={onVolumeChange} />
            {/if}
        </div>

        <div class="player-actions flex min-w-0 items-center gap-[clamp(2px,0.3vw,6px)]">
            <PlayerButton label="Audio: {currentAudioLabel || 'Default'}" onclick={onAudioClick}>
                <AudioLines strokeWidth={2} />
            </PlayerButton>
            <PlayerButton label="Subtitles: {currentSubtitleLabel || 'Off'}" onclick={onSubtitleClick}>
                <Subtitles strokeWidth={2} />
            </PlayerButton>
            <PlayerButton label={objectFit === "contain" ? "Fill screen" : "Fit to screen"} onclick={toggleObjectFit}>
                {#if objectFit === "contain"}
                    <ZoomIn strokeWidth={2} />
                {:else}
                    <ZoomOut strokeWidth={2} />
                {/if}
            </PlayerButton>
            {#if !isAndroidPlatform}
                <PlayerButton label="Clip" onclick={() => setClipPanelOpen(!clipPanelOpen)}>
                    <Scissors strokeWidth={2} />
                </PlayerButton>
                {#if canDownload && videoSrc}
                    <PlayerButton label="Download" onclick={() => window.open(videoSrc)}>
                        <Download strokeWidth={2} />
                    </PlayerButton>
                {/if}
                <PlayerButton label="Fullscreen" onclick={toggleFullscreen}>
                    <Maximize strokeWidth={2} />
                </PlayerButton>
            {/if}
        </div>
    </div>

    <ClipPanel
        open={clipPanelOpen}
        {videoSrc}
        {duration}
        currentTime={displayedTime}
        onClose={() => setClipPanelOpen(false)}
    />
</div>

<style>
    .player-time {
        min-width: 4.5ch;
        font-size: clamp(13px, 0.95vw, 17px);
    }

    .player-play-button,
    .player-play-button :global(svg) {
        width: clamp(42px, 3vw, 58px);
        height: clamp(42px, 3vw, 58px);
    }

    @media (max-width: 760px), (orientation: portrait) {
        .player-actions {
            overflow-x: auto;
            scrollbar-width: none;
        }
    }
</style>
