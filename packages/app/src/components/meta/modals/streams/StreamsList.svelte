<script lang="ts">
    import { openSettings } from "../../../../lib/stores/settings";
    import LoadingSpinner from "../../../common/LoadingSpinner.svelte";
    import StreamRow from "./StreamRow.svelte";
    import type { EnrichedStream } from "../../../../lib/streams/ranking/types";

    export let loadingStreams = false;
    export let streams: any[] = [];
    export let filteredStreams: EnrichedStream[] = [];
    export let localFilteredStreams: EnrichedStream[] = [];
    export let addonFilteredStreams: EnrichedStream[] = [];
    export let showAddonSetupGuide = false;

    export let onStreamClick: (item: EnrichedStream) => void = () => {};

</script>

<div class="no-scrollbar -mx-4 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
    {#if loadingStreams}
        <div class="flex justify-center py-10">
            <LoadingSpinner size="40px" />
        </div>
    {:else if filteredStreams.length === 0}
        {#if showAddonSetupGuide}
            <div class="flex flex-col items-center justify-center gap-5 px-4 py-12 text-center">
                <div class="flex max-w-md flex-col gap-2">
                    <h3 class="text-ink text-xl font-semibold">
                        Add a stream addon
                    </h3>
                    <p class="text-ink/60 text-sm leading-relaxed">
                        Raffi needs a stream addon before it can show online sources. Open Addons and install a community addon that supports Streams.
                    </p>
                </div>
                <button
                    type="button"
                    data-tv-autofocus
                    class="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-on-accent transition-colors hover:bg-accent/85 cursor-pointer"
                    on:click={() => openSettings("addons", "stream")}
                >
                    Open Addons
                </button>
            </div>
        {:else}
            <div class="text-ink/50 text-center py-10">
                {streams.length === 0
                    ? "No streams found."
                    : "No streams match the current filters."}
            </div>
        {/if}
    {:else}
        {#if localFilteredStreams.length}
            <p class="px-4 pt-1 pb-1 text-sm font-medium text-ink/50">On this device</p>
            {#each localFilteredStreams as item (item.key)}
                <StreamRow {item} onClick={() => onStreamClick(item)} />
            {/each}

            {#if addonFilteredStreams.length}
                <p class="px-4 pt-4 pb-1 text-sm font-medium text-ink/50">Online</p>
            {/if}
        {/if}

        {#if addonFilteredStreams.length}
            {#each addonFilteredStreams as item (item.key)}
                <StreamRow {item} onClick={() => onStreamClick(item)} />
            {/each}
        {/if}
    {/if}
</div>
