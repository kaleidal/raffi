<script lang="ts" module>
    import type { Chapter } from "../../../pages/player/types";
    import type { SeekPreview } from "../../../lib/media/preview/seekPreview";
    import type { TimeRange } from "../seek/seekTrack";
    import type { TrackOptions } from "../tracks/types";

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
        tracks: TrackOptions;
        tracksOpen: boolean;
        objectFit: "contain" | "cover";
        togglePlay: () => void;
        onSeekInput: (time: number) => void;
        onSeekChange: (time: number) => void;
        onVolumeChange: (volume: number) => void;
        toggleFullscreen: () => void;
        toggleObjectFit: () => void;
        onTracksOpenChange: (open: boolean) => void;
        onClipEditorOpenChange?: (open: boolean) => void;
        pinned?: boolean;
        onTogglePin?: () => void;
    };
</script>

<script lang="ts">
    import type { Snippet } from "svelte";
    import { Download, Maximize, Pin, PinOff, Scissors, Subtitles, ZoomIn, ZoomOut } from "@lucide/svelte";
    import { isAndroidPlatform } from "../../../lib/shell/platform";
    import { formatTime } from "../../../lib/utils/time";
    import { persistShowRemaining, readShowRemaining } from "../../../pages/player/controls/playerPreferences";
    import ClipEditor from "../clip/ClipEditor.svelte";
    import PlayPauseIcon from "../PlayPauseIcon.svelte";
    import SeekBar from "../seek/SeekBar.svelte";
    import TrackPanel from "../tracks/TrackPanel.svelte";
    import { TRACK_PANEL_ID } from "../tracks/types";
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
        tracks,
        tracksOpen,
        objectFit,
        togglePlay,
        onSeekInput,
        onSeekChange,
        onVolumeChange,
        toggleFullscreen,
        toggleObjectFit,
        onTracksOpenChange,
        onClipEditorOpenChange = () => {},
        pinned = false,
        onTogglePin,
        seek,
    }: PlayerControlsProps & { seek?: Snippet } = $props();

    let clipEditorOpen = $state(false);

    const displayedTime = $derived(pendingSeek ?? currentTime);
    let showRemaining = $state(readShowRemaining());

    function toggleRemaining() {
        showRemaining = !showRemaining;
        persistShowRemaining(showRemaining);
    }

    function setClipEditorOpen(open: boolean) {
        clipEditorOpen = open;
        onClipEditorOpenChange(open);
    }
</script>

{#if clipEditorOpen}
    <ClipEditor
        {duration}
        currentTime={displayedTime}
        {isPlaying}
        {videoSrc}
        {seekPreview}
        {togglePlay}
        {onSeekChange}
        onClose={() => setClipEditorOpen(false)}
    />
{:else}
    <div class="relative flex w-full flex-col gap-[clamp(4px,0.5vw,10px)]">
        {#if tracksOpen}
            <div class="absolute right-0 bottom-full z-10 mb-[clamp(12px,1vw,18px)]">
                <TrackPanel options={tracks} onClose={() => onTracksOpenChange(false)} />
            </div>
        {/if}
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
                <PlayerButton
                    label="Audio and subtitles"
                    controls={TRACK_PANEL_ID}
                    active={tracksOpen}
                    onclick={() => onTracksOpenChange(!tracksOpen)}
                >
                    <Subtitles strokeWidth={2} />
                </PlayerButton>
                {#if !isAndroidPlatform}
                    <PlayerButton label="Clip" onclick={() => setClipEditorOpen(true)}>
                        <Scissors strokeWidth={2} />
                    </PlayerButton>
                    {#if canDownload && videoSrc}
                        <PlayerButton label="Download" onclick={() => window.open(videoSrc)}>
                            <Download strokeWidth={2} />
                        </PlayerButton>
                    {/if}
                {/if}
                <span class="mx-[clamp(4px,0.5vw,10px)] h-6 w-px bg-ink/15" aria-hidden="true"></span>
                <PlayerButton label={objectFit === "contain" ? "Fill screen" : "Fit to screen"} onclick={toggleObjectFit}>
                    {#if objectFit === "contain"}
                        <ZoomIn strokeWidth={2} />
                    {:else}
                        <ZoomOut strokeWidth={2} />
                    {/if}
                </PlayerButton>
                {#if onTogglePin}
                    <PlayerButton label={pinned ? "Let controls hide" : "Keep controls on screen"} active={pinned} onclick={onTogglePin}>
                        {#if pinned}
                            <PinOff strokeWidth={2} />
                        {:else}
                            <Pin strokeWidth={2} />
                        {/if}
                    </PlayerButton>
                {/if}
                {#if !isAndroidPlatform}
                    <PlayerButton label="Fullscreen" onclick={toggleFullscreen}>
                        <Maximize strokeWidth={2} />
                    </PlayerButton>
                {/if}
            </div>
        </div>
    </div>
{/if}

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
