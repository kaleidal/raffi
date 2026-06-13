<script lang="ts">
    import LoadingSpinner from "../../../common/LoadingSpinner.svelte";
    import StreamCard from "./StreamCard.svelte";
    import type { EnrichedStream } from "./types";

    export let loadingStreams = false;
    export let streams: any[] = [];
    export let filteredStreams: EnrichedStream[] = [];
    export let localFilteredStreams: EnrichedStream[] = [];
    export let addonFilteredStreams: EnrichedStream[] = [];
    export let showAddonSetupGuide = false;

    export let onStreamClick: (stream: any) => void = () => {};
    export let onOpenAddons: () => void = () => {};

    const handleStreamClick = (stream: any) => {
        onStreamClick(stream);
    };
</script>

<div class="flex flex-col gap-4 overflow-y-auto pr-1 flex-1 min-h-0">
    {#if loadingStreams}
        <div class="flex justify-center py-10">
            <LoadingSpinner size="40px" />
        </div>
    {:else if filteredStreams.length === 0}
        {#if showAddonSetupGuide}
            <div class="flex flex-col items-center justify-center gap-5 px-4 py-12 text-center">
                <div class="flex max-w-md flex-col gap-2">
                    <h3 class="text-white text-xl font-poppins font-semibold">
                        Add a stream addon
                    </h3>
                    <p class="text-white/60 text-sm leading-relaxed">
                        Raffi needs a stream addon before it can show online sources. Open Addons and install a community addon that supports Streams.
                    </p>
                </div>
                <button
                    type="button"
                    class="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-white/90 cursor-pointer"
                    on:click={onOpenAddons}
                >
                    Open Addons
                </button>
            </div>
        {:else}
            <div class="text-white/50 text-center py-10">
                {streams.length === 0
                    ? "No streams found."
                    : "No streams match the current filters."}
            </div>
        {/if}
    {:else}
        {#if localFilteredStreams.length}
            <div class="flex items-center justify-between">
                <span class="text-white/60 text-sm font-medium">
                    Local files
                </span>
            </div>
            {#each localFilteredStreams as item (item.key)}
                <StreamCard
                    {item}
                    disabled={item.isFailed}
                    onClick={() => handleStreamClick(item.stream)}
                />
            {/each}

            {#if addonFilteredStreams.length}
                <div class="h-px bg-white/10"></div>
            {/if}
        {/if}

        {#if addonFilteredStreams.length}
            <div class="flex items-center justify-between">
                <span class="text-white/60 text-sm font-medium">
                    Online sources · {addonFilteredStreams.length}
                </span>
            </div>
            {#each addonFilteredStreams as item (item.key)}
                <StreamCard
                    {item}
                    showPeers
                    disabled={item.isFailed}
                    onClick={() => handleStreamClick(item.stream)}
                />
            {/each}
        {/if}
    {/if}
</div>
