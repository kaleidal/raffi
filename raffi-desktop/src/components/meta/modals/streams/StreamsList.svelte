<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import LoadingSpinner from "../../../common/LoadingSpinner.svelte";
    import StreamCard from "./StreamCard.svelte";
    import type { EnrichedStream } from "./types";

    export let loadingStreams = false;
    export let streams: any[] = [];
    export let filteredStreams: EnrichedStream[] = [];
    export let localFilteredStreams: EnrichedStream[] = [];
    export let addonFilteredStreams: EnrichedStream[] = [];

    const dispatch = createEventDispatcher();

    const onStreamClick = (stream: any) => {
        dispatch("streamClick", stream);
    };
</script>

<div class="flex flex-col gap-4 overflow-y-auto pr-1 flex-1 min-h-0">
    {#if loadingStreams}
        <div class="flex justify-center py-10">
            <LoadingSpinner size="40px" />
        </div>
    {:else if filteredStreams.length === 0}
        <div class="text-white/50 text-center py-10">
            {streams.length === 0
                ? "No streams found."
                : "No streams match the current filters."}
        </div>
    {:else}
        {#if localFilteredStreams.length}
            <div class="flex items-center justify-between">
                <span class="text-white/60 text-xs font-semibold tracking-[0.25em] uppercase">
                    Local
                </span>
            </div>
            {#each localFilteredStreams as item (item.key)}
                <StreamCard {item} on:click={() => onStreamClick(item.stream)} />
            {/each}

            {#if addonFilteredStreams.length}
                <div class="h-px bg-white/10"></div>
            {/if}
        {/if}

        {#if addonFilteredStreams.length}
            <div class="flex items-center justify-between">
                <span class="text-white/60 text-xs font-semibold tracking-[0.25em] uppercase">
                    {addonFilteredStreams.length} Source{addonFilteredStreams.length > 1 ? 's' : ''}
                </span>
            </div>
            {#each addonFilteredStreams as item (item.key)}
                <StreamCard {item} showPeers on:click={() => onStreamClick(item.stream)} />
            {/each}
        {/if}
    {/if}
</div>
