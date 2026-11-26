<script lang="ts">
    import { onMount, tick } from "svelte";
    import GuideRow from "./GuideRow.svelte";
    import { requestProgrammes } from "../../../lib/live/library";
    import type { LiveChannel } from "../../../lib/live/types";
    import { MINUTE, SLOT, SPAN, slotLabel, slotsBetween, timelineStart } from "./timeline";
    import { remToPx, trackViewport, visibleRows } from "./virtualRows";

    let {
        channels,
        now,
        onPlay,
        onMenu,
        onHighlight,
    }: {
        channels: LiveChannel[];
        now: number;
        onPlay: (channel: LiveChannel) => void;
        onMenu: (event: MouseEvent, channel: LiveChannel) => void;
        onHighlight: (channel: LiveChannel) => void;
    } = $props();

    const LOOKAROUND = 60 * MINUTE;

    let scroller: HTMLDivElement;
    let rowHeight = $state(0);
    let rulerHeight = $state(0);
    let channelWidth = $state(0);
    let minuteWidth = $state(0);
    let scrollTop = $state(0);
    let scrollLeft = $state(0);
    let viewportWidth = $state(0);
    let viewportHeight = $state(0);

    const origin = timelineStart(Date.now());

    const timelineWidth = $derived((SPAN / MINUTE) * minuteWidth);
    const { first, last } = $derived(visibleRows(scrollTop, viewportHeight - rulerHeight, rowHeight, channels.length));
    const rows = $derived(channels.slice(first, last));
    const viewStart = $derived(minuteWidth ? origin + (scrollLeft / minuteWidth) * MINUTE : origin);
    const from = $derived(Math.floor((viewStart - LOOKAROUND) / SLOT) * SLOT);
    const until = $derived(
        Math.ceil((viewStart + (minuteWidth ? (viewportWidth / minuteWidth) * MINUTE : 0) + LOOKAROUND) / SLOT) * SLOT,
    );
    const slots = $derived(slotsBetween(Math.max(from, origin), Math.min(until, origin + SPAN)));
    const nowX = $derived(channelWidth + ((now - origin) / MINUTE) * minuteWidth);

    $effect(() => {
        requestProgrammes(rows.map((channel) => channel.guideId));
    });

    const slotX = (time: number) => channelWidth + ((time - origin) / MINUTE) * minuteWidth;

    function measure() {
        rowHeight = remToPx(5.25);
        rulerHeight = remToPx(3);
        channelWidth = scroller.clientWidth < 700 ? remToPx(8.5) : remToPx(17.5);
        minuteWidth = remToPx(12) / 30;
        read();
    }

    function read() {
        scrollTop = scroller.scrollTop;
        scrollLeft = scroller.scrollLeft;
        viewportWidth = scroller.clientWidth - channelWidth;
        viewportHeight = scroller.clientHeight;
    }

    export function scrollToNow(behavior: ScrollBehavior = "smooth") {
        scroller.scrollTo({ left: Math.max(0, ((Date.now() - 15 * MINUTE - origin) / MINUTE) * minuteWidth), behavior });
    }

    onMount(() => {
        measure();
        void tick().then(() => scrollToNow("instant"));
        const stop = trackViewport(scroller, read);
        window.addEventListener("resize", measure);
        return () => {
            stop();
            window.removeEventListener("resize", measure);
        };
    });
</script>

<div
    bind:this={scroller}
    class="guide relative h-full min-h-0 w-full overflow-auto overscroll-contain no-scrollbar"
    style="scroll-padding-left:{channelWidth}px;scroll-padding-top:{rulerHeight}px"
>
    <div class="relative" style="width:{channelWidth + timelineWidth}px;height:{rulerHeight + channels.length * rowHeight}px">
        <div class="sticky top-0 z-20 bg-canvas" style="height:{rulerHeight}px;width:{channelWidth + timelineWidth}px">
            <button
                class="sticky left-0 z-10 flex h-full items-center bg-canvas pl-12 text-sm font-medium text-ink/60 hover:text-ink cursor-pointer"
                style="width:{channelWidth}px"
                onclick={() => scrollToNow()}
            >
                Now
            </button>
            {#each slots as time (time)}
                <span
                    class="absolute top-0 flex h-full items-center border-l border-ink/[0.07] px-3 text-xs tabular-nums text-ink/45"
                    style="left:{slotX(time)}px"
                >
                    {slotLabel(time)}
                </span>
            {/each}
            {#if nowX > channelWidth}
                <span class="absolute bottom-0 size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-ink" style="left:{nowX}px"></span>
            {/if}
        </div>

        {#if nowX > channelWidth}
            <div
                class="pointer-events-none absolute z-[5] w-px -translate-x-1/2 bg-ink/70"
                style="left:{nowX}px;top:{rulerHeight}px;height:{channels.length * rowHeight}px"
            ></div>
        {/if}

        {#each rows as channel, index (channel.id)}
            <GuideRow
                {channel}
                top={rulerHeight + (first + index) * rowHeight}
                height={rowHeight}
                {channelWidth}
                {minuteWidth}
                {origin}
                {from}
                {until}
                {now}
                edge={channelWidth + scrollLeft}
                {onPlay}
                {onMenu}
                {onHighlight}
            />
        {/each}
    </div>
</div>
