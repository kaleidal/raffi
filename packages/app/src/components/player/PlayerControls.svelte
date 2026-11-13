<script lang="ts">
    import Slider from "../common/Slider.svelte";
    import IconButton from "../common/IconButton.svelte";
    import PlayPauseIcon from "./PlayPauseIcon.svelte";
    import type { ShowResponse } from "../../lib/library/types/meta_types";
    import type { Chapter } from "../../pages/player/types";
    import ClipPanel from "./ClipPanel.svelte";
    import SeekBar from "./seek/SeekBar.svelte";
    import type { TimeRange } from "./seek/seekTrack";
    import type { SeekPreview } from "../../lib/media/preview/seekPreview";
    import { isAndroidPlatform } from "../../lib/shell/platform";
    import { formatTime } from "../../lib/utils/time";
    import {
        Maximize,
        ZoomIn,
        ZoomOut,
        AudioWaveform,
        Subtitles,
        Users,
        Download,
        Scissors,
    } from "@lucide/svelte";

    export let isPlaying = false;
    export let duration = 0;
    export let currentTime = 0;
    export let volume = 1;
    export let videoSrc: string | null = null;
    export let metaData: ShowResponse | null = null;
    export let currentAudioLabel: string = "";
    export let currentSubtitleLabel: string = "";
    export let objectFit: "contain" | "cover" = "contain";
    export let pendingSeek: number | null = null;
    export let isWatchPartyMember = false;
    export let showWatchParty = true;
    export let chapterMarkers: Chapter[] = [];
    export let seekPreview: SeekPreview | null = null;
    export let visible = true;
    export let buffered: TimeRange[] = [];

    export let seekBarStyle: "raffi" | "normal" = "raffi";

    export let togglePlay: () => void;
    export let onSeekInput: (time: number) => void;
    export let onSeekChange: (time: number) => void;
    export let onVolumeChange: (volume: number) => void;
    export let toggleFullscreen: () => void;
    export let toggleObjectFit: () => void;

    export let onAudioClick: () => void = () => {};
    export let onSubtitleClick: () => void = () => {};
    export let onWatchPartyClick: () => void = () => {};
    export let onClipPanelOpenChange: (detail: { open: boolean }) => void = () => {};

    $: displayedTime = pendingSeek ?? currentTime;
    $: remainingTime = Math.max(0, duration - displayedTime);

    let showClipPanel = false;

    const setClipPanelOpen = (open: boolean) => {
        showClipPanel = open;
        onClipPanelOpenChange({ open });
    };
</script>

<div
    class="player-controls relative z-10 items-center flex flex-col text-white overflow-hidden"
>
    <div class="player-controls-surface absolute inset-0 rounded-[inherit] bg-[#000000]/10 backdrop-blur-xl pointer-events-none"></div>

    <div class="relative z-10 flex flex-col gap-2 w-full">
        <div class="player-seek-row flex flex-row items-center w-full">
            {#if !isWatchPartyMember}
                <button
                    on:click={togglePlay}
                    class="player-play-button rounded-full cursor-pointer hover:opacity-80"
                    aria-label={isPlaying ? "Pause" : "Play"}
                >
                    <PlayPauseIcon playing={isPlaying} />
                </button>
            {/if}

            <span
                class="inline-block tabular-nums text-[clamp(14px,1.15vw,22px)] font-roboto font-medium text-[#D3D3D3] text-center"
                >{formatTime(
                    seekBarStyle === "normal" ? displayedTime : remainingTime,
                )}</span
            >

            <div class="min-w-0 flex-1">
                <slot name="seek">
                    <SeekBar
                        {duration}
                        time={displayedTime}
                        inverted={seekBarStyle !== "normal"}
                        chapters={chapterMarkers}
                        {buffered}
                        {seekPreview}
                        disabled={isWatchPartyMember}
                        {visible}
                        onScrub={onSeekInput}
                        onCommit={onSeekChange}
                    />
                </slot>
            </div>
            {#if seekBarStyle === "normal"}
                <span
                    class="inline-block tabular-nums text-[clamp(14px,1.15vw,22px)] font-roboto font-medium text-[#D3D3D3] text-center"
                    >{formatTime(duration)}</span
                >
            {/if}
        </div>

        <div class="player-actions flex items-center w-full justify-center">
            {#if !isAndroidPlatform}
                <IconButton
                    label="Fullscreen"
                    onClick={() => {
                        toggleFullscreen();
                    }}
                >
                    <Maximize size={22} color="#E9E9E9" strokeWidth={2} />
                </IconButton>
            {/if}

            <IconButton
                label={objectFit === "contain" ? "Zoom" : "Fit"}
                onClick={toggleObjectFit}
            >
                {#if objectFit === "contain"}
                    <ZoomIn size={20} color="#E9E9E9" strokeWidth={2} />
                {:else}
                    <ZoomOut size={20} color="#E9E9E9" strokeWidth={2} />
                {/if}
            </IconButton>

            {#if !isWatchPartyMember}
                <IconButton
                    label={currentAudioLabel || "Audio"}
                    onClick={onAudioClick}
                >
                    <AudioWaveform size={20} color="#E9E9E9" strokeWidth={2} />
                </IconButton>
            {/if}

            <IconButton
                label={currentSubtitleLabel || "Subtitles: Off"}
                onClick={onSubtitleClick}
            >
                <Subtitles size={20} color="#E9E9E9" strokeWidth={2} />
            </IconButton>

            {#if metaData && showWatchParty}
                <IconButton
                    label="Watch Party"
                    onClick={onWatchPartyClick}
                >
                    <Users size={20} color="#E9E9E9" strokeWidth={2} />
                </IconButton>
            {/if}

            {#if metaData && !isAndroidPlatform}
            <IconButton
                label="Download"
                onClick={() => {
                    window.open(videoSrc!!);
                }}
            >
                <Download size={22} color="#E9E9E9" strokeWidth={2} />
            </IconButton>
            {/if}

            {#if !isWatchPartyMember && !isAndroidPlatform}
                <IconButton
                    label="Clip"
                    onClick={() => setClipPanelOpen(!showClipPanel)}
                >
                    <Scissors size={20} color="#E9E9E9" strokeWidth={2} />
                </IconButton>
            {/if}

            {#if !isAndroidPlatform}
                <div class="player-volume">
                    <Slider
                        onInput={onVolumeChange}
                        value={volume}
                        label="Volume"
                    />
                </div>
            {/if}
        </div>

        <ClipPanel
            open={showClipPanel}
            {videoSrc}
            {duration}
            currentTime={displayedTime}
            inverted={seekBarStyle !== "normal"}
            {isWatchPartyMember}
            onClose={() => setClipPanelOpen(false)}
        />
    </div>
</div>

<style>
    .player-controls {
        width: min(860px, calc(100vw - 32px));
        gap: 10px;
        border-radius: 28px;
        padding: 16px 20px;
    }

    .player-seek-row {
        gap: 14px;
    }

    .player-play-button,
    .player-play-button :global(svg) {
        width: clamp(40px, 3.125vw, 60px);
        height: clamp(40px, 3.125vw, 60px);
        flex: 0 0 auto;
    }

    .player-play-button {
        transition: opacity 200ms ease-out, scale 140ms cubic-bezier(0.2, 0, 0, 1);
    }

    .player-actions {
        gap: 10px;
    }

    .player-volume {
        width: clamp(108px, 9vw, 144px);
    }

    @media (max-width: 760px), (orientation: portrait) {
        .player-controls {
            width: calc(100vw - 20px);
            gap: 8px;
            border-radius: 22px;
            padding: 10px 12px 12px;
        }

        .player-seek-row {
            gap: 10px;
        }

        .player-actions {
            gap: 8px;
            justify-content: flex-start;
            overflow-x: auto;
            padding: 2px 0;
            scrollbar-width: none;
        }

        .player-actions::-webkit-scrollbar {
            display: none;
        }

        .player-volume {
            min-width: 110px;
        }
    }
</style>
