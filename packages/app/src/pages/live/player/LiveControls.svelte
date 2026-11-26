<script lang="ts">
    import { Maximize, Star, ZoomIn, ZoomOut } from "@lucide/svelte";
    import IconButton from "../../../components/common/controls/IconButton.svelte";
    import VolumeControl from "../../../components/player/chrome/VolumeControl.svelte";
    import PlayPauseIcon from "../../../components/player/PlayPauseIcon.svelte";
    import ChannelLogo from "../components/ChannelLogo.svelte";
    import { isAndroidPlatform } from "../../../lib/shell/platform";
    import { progressThrough } from "../../../lib/live/lineup";
    import type { LiveChannel, Programme } from "../../../lib/live/types";
    import { formatClock } from "../guide/timeline";

    let {
        channel,
        airing,
        now,
        playing,
        volume,
        favourite,
        objectFit,
        togglePlay,
        onVolumeChange,
        toggleFavourite,
        toggleObjectFit,
        toggleFullscreen,
    }: {
        channel: LiveChannel;
        airing: Programme | null;
        now: number;
        playing: boolean;
        volume: number;
        favourite: boolean;
        objectFit: "contain" | "cover";
        togglePlay: () => void;
        onVolumeChange: (volume: number) => void;
        toggleFavourite: () => void;
        toggleObjectFit: () => void;
        toggleFullscreen: () => void;
    } = $props();
</script>

<div class="live-controls relative z-10 flex items-center text-ink overflow-hidden">
    <div class="absolute inset-0 rounded-[inherit] bg-canvas/10 backdrop-blur-xl pointer-events-none"></div>

    <button class="live-play relative rounded-full cursor-pointer hover:opacity-80" onclick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
        <PlayPauseIcon {playing} />
    </button>

    <div class="relative flex min-w-0 flex-1 items-center gap-3">
        <span class="flex h-11 aspect-[3/2] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ink/[0.08]">
            <ChannelLogo {channel} />
        </span>
        <span class="flex min-w-0 flex-col">
            <span class="truncate text-[0.95rem] font-medium">
                {#if channel.number}<span class="mr-2 tabular-nums text-ink/45">{channel.number}</span>{/if}{channel.name}
            </span>
            {#if airing}
                <span class="flex min-w-0 items-center gap-2 text-xs text-ink/55">
                    <span class="truncate">{airing.title}</span>
                    <span class="h-[3px] w-14 shrink-0 overflow-hidden rounded-full bg-ink/15">
                        <span class="block h-full origin-left bg-ink/75" style="transform:scaleX({progressThrough(airing, now)})"></span>
                    </span>
                    <span class="shrink-0 tabular-nums text-ink/40">{formatClock(airing.stop)}</span>
                </span>
            {/if}
        </span>
    </div>

    <div class="relative flex shrink-0 items-center gap-[10px]">
        <IconButton label={favourite ? "Remove from Favourites" : "Add to Favourites"} onClick={toggleFavourite}>
            <Star size={20} fill={favourite ? "currentColor" : "none"} strokeWidth={2} />
        </IconButton>
        <IconButton label={objectFit === "contain" ? "Zoom" : "Fit"} onClick={toggleObjectFit}>
            {#if objectFit === "contain"}
                <ZoomIn size={20} strokeWidth={2} />
            {:else}
                <ZoomOut size={20} strokeWidth={2} />
            {/if}
        </IconButton>
        {#if !isAndroidPlatform}
            <IconButton label="Fullscreen" onClick={toggleFullscreen}>
                <Maximize size={22} strokeWidth={2} />
            </IconButton>
            <VolumeControl {volume} onChange={onVolumeChange} />
        {/if}
    </div>
</div>

<style>
    .live-controls {
        width: min(860px, calc(100vw - 32px));
        gap: 14px;
        border-radius: 28px;
        padding: 14px 26px 14px 16px;
    }

    .live-play,
    .live-play :global(svg) {
        width: clamp(40px, 3.125vw, 60px);
        height: clamp(40px, 3.125vw, 60px);
        flex: 0 0 auto;
    }

    @media (max-width: 760px), (orientation: portrait) {
        .live-controls {
            width: calc(100vw - 20px);
            gap: 10px;
            border-radius: 22px;
            padding: 10px 16px 10px 10px;
        }
    }
</style>
