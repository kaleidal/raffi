<script lang="ts">
    import { onMount } from "svelte";
    import ChannelCard from "./ChannelCard.svelte";
    import { requestProgrammes } from "../../../lib/live/library";
    import type { LiveChannel } from "../../../lib/live/types";
    import { remToPx, trackViewport, visibleRows } from "../guide/virtualRows";

    export let channels: LiveChannel[];
    export let now: number;
    export let onPlay: (channel: LiveChannel) => void;
    export let onMenu: (event: MouseEvent, channel: LiveChannel) => void;

    let scroller: HTMLDivElement;
    let width = 0;
    let gap = 0;
    let columns = 1;
    let rowHeight = 0;
    let scrollTop = 0;
    let viewportHeight = 0;

    $: rowCount = Math.ceil(channels.length / columns);
    $: ({ first, last } = visibleRows(scrollTop, viewportHeight, rowHeight, rowCount));
    $: rows = Array.from({ length: Math.max(0, last - first) }, (_, offset) => {
        const row = first + offset;
        return { row, channels: channels.slice(row * columns, (row + 1) * columns) };
    });
    $: requestProgrammes(rows.flatMap((row) => row.channels.map((channel) => channel.guideId)));

    function measure() {
        width = scroller.clientWidth;
        gap = remToPx(1.25);
        columns = Math.max(2, Math.floor((width + gap) / (remToPx(15) + gap)));
        const cardWidth = (width - gap * (columns - 1)) / columns;
        rowHeight = (cardWidth * 9) / 16 + remToPx(4.25) + gap;
        read();
    }

    function read() {
        scrollTop = scroller.scrollTop;
        viewportHeight = scroller.clientHeight;
        if (scroller.clientWidth !== width) measure();
    }

    onMount(() => {
        measure();
        return trackViewport(scroller, read);
    });
</script>

<div bind:this={scroller} class="relative h-full min-h-0 w-full overflow-y-auto overscroll-contain no-scrollbar">
    <div class="relative w-full" style="height:{rowCount * rowHeight}px">
        {#each rows as { row, channels: cards } (row)}
            <div
                class="absolute left-0 grid w-full"
                style="top:{row * rowHeight}px;height:{rowHeight - gap}px;gap:{gap}px;grid-template-columns:repeat({columns}, minmax(0, 1fr))"
                data-scroll-row
            >
                {#each cards as channel (channel.id)}
                    <ChannelCard {channel} {now} {onPlay} {onMenu} />
                {/each}
            </div>
        {/each}
    </div>
</div>
