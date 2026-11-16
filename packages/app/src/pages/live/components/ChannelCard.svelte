<script lang="ts">
    import ChannelLogo from "./ChannelLogo.svelte";
    import { nowAndNext, progressThrough } from "../../../lib/live/lineup";
    import { guideProgrammes } from "../../../lib/live/library";
    import type { LiveChannel } from "../../../lib/live/types";

    export let channel: LiveChannel;
    export let now: number;
    export let onPlay: (channel: LiveChannel) => void;
    export let onMenu: (event: MouseEvent, channel: LiveChannel) => void;

    $: airing = nowAndNext(channel.guideId ? $guideProgrammes.get(channel.guideId) : undefined, now).now;
</script>

<button
    class="channel-card group flex h-full w-full flex-col gap-3 text-left cursor-pointer"
    onclick={() => onPlay(channel)}
    oncontextmenu={(event) => {
        event.preventDefault();
        onMenu(event, channel);
    }}
>
    <span class="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-[20px] bg-ink/[0.05] transition-colors duration-200 group-hover:bg-ink/[0.1]">
        <ChannelLogo {channel} size="large" />
        {#if channel.number}
            <span class="absolute left-3 top-2.5 text-xs tabular-nums text-ink/35">{channel.number}</span>
        {/if}
        {#if airing}
            <span class="absolute inset-x-0 bottom-0 h-[3px] bg-ink/10">
                <span class="block h-full origin-left bg-ink/80" style="transform:scaleX({progressThrough(airing, now)})"></span>
            </span>
        {/if}
    </span>
    <span class="flex min-w-0 flex-col px-1">
        <span class="truncate text-[0.95rem] font-medium text-ink/90">{channel.name}</span>
        <span class="truncate text-sm text-ink/45">{airing?.title ?? channel.group}</span>
    </span>
</button>
