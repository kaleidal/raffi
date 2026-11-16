<script lang="ts">
    import ChannelLogo from "../components/ChannelLogo.svelte";
    import { programmesBetween } from "../../../lib/live/lineup";
    import { guideProgrammes } from "../../../lib/live/library";
    import type { LiveChannel } from "../../../lib/live/types";
    import { formatClock, MINUTE } from "./timeline";

    export let channel: LiveChannel;
    export let top: number;
    export let height: number;
    export let channelWidth: number;
    export let minuteWidth: number;
    export let origin: number;
    export let from: number;
    export let until: number;
    export let now: number;
    /** Where the visible timeline begins, so titles of programmes already under way stay readable. */
    export let edge: number;
    export let onPlay: (channel: LiveChannel) => void;
    export let onMenu: (event: MouseEvent, channel: LiveChannel) => void;

    $: all = channel.guideId ? $guideProgrammes.get(channel.guideId) : undefined;
    $: programmes = programmesBetween(all, Math.max(from, origin), until);
    $: hasGuide = Boolean(all?.length);

    $: x = (time: number) => channelWidth + ((Math.max(time, origin) - origin) / MINUTE) * minuteWidth;

    function menu(event: MouseEvent) {
        event.preventDefault();
        onMenu(event, channel);
    }
</script>

<div class="guide-row absolute left-0 w-full" style="top:{top}px;height:{height}px" data-scroll-row>
    <button
        class="channel-cell sticky left-0 z-10 flex h-full items-center gap-3 bg-canvas pr-3 text-left cursor-pointer"
        style="width:{channelWidth}px"
        onclick={() => onPlay(channel)}
        oncontextmenu={menu}
    >
        <span class="channel-number w-9 shrink-0 text-right text-sm tabular-nums text-ink/35 ">{channel.number ?? ""}</span>
        <span class="flex h-[72%] aspect-[3/2] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ink/[0.05]">
            <ChannelLogo {channel} />
        </span>
        <span class="channel-name min-w-0 truncate text-[0.95rem] font-medium text-ink/85">{channel.name}</span>
    </button>

    {#each programmes as programme (programme.start)}
        {@const airing = programme.start <= now && now < programme.stop}
        {@const ended = programme.stop <= now}
        <button
            class="programme absolute top-[6%] flex h-[88%] min-w-0 flex-col justify-center overflow-hidden rounded-2xl pr-4 text-left cursor-pointer transition-colors duration-150 {airing
                ? 'bg-ink/[0.12] hover:bg-ink/[0.18]'
                : 'bg-ink/[0.045] hover:bg-ink/[0.1]'}"
            style="left:{x(programme.start) + 2}px;width:{Math.max(0, x(programme.stop) - x(programme.start) - 4)}px;padding-left:{Math.max(0, edge - x(programme.start)) + 16}px"
            onclick={() => onPlay(channel)}
            oncontextmenu={menu}
        >
            <span class="truncate text-[0.92rem] font-medium {ended ? 'text-ink/40' : 'text-ink/90'}">{programme.title || channel.name}</span>
            <span class="truncate text-xs tabular-nums {ended ? 'text-ink/25' : 'text-ink/45'}">
                {formatClock(programme.start)} – {formatClock(programme.stop)}
            </span>
        </button>
    {:else}
        {#if !hasGuide}
            <button
                class="absolute top-[6%] h-[88%] rounded-2xl bg-ink/[0.03] cursor-pointer hover:bg-ink/[0.07]"
                style="left:{x(Math.max(from, origin)) + 2}px;width:{x(until) - x(Math.max(from, origin)) - 4}px"
                aria-label={channel.name}
                onclick={() => onPlay(channel)}
                oncontextmenu={menu}
            ></button>
        {/if}
    {/each}
</div>

<style>
    .channel-cell:hover .channel-name,
    .channel-cell:focus-visible .channel-name {
        color: var(--raffi-ink);
    }

    @media (max-width: 700px), (orientation: portrait) {
        .channel-name {
            display: none;
        }
    }
</style>
