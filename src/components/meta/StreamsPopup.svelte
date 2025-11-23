<script lang="ts">
    import { fade } from "svelte/transition";
    import { createEventDispatcher } from "svelte";
    import type { Addon } from "../../lib/db/db";

    export let streamsPopupVisible = false;
    export let addons: Addon[] = [];
    export let selectedAddon: string;
    export let loadingStreams = false;
    export let streams: any[] = [];
    export let metaData: any;

    const dispatch = createEventDispatcher();

    function close() {
        dispatch("close");
    }

    function onStreamClick(stream: any) {
        dispatch("streamClick", stream);
    }

    function truncateWords(text: string, maxWords: number) {
        if (!text) return "";
        const words = text.split(/\s+/);
        if (words.length <= maxWords) return text;
        return words.slice(0, maxWords).join(" ") + "…";
    }

    function getStreamTitle(stream: any) {
        if (!stream.title) {
            return metaData.meta.type === "movie"
                ? "Watch Movie"
                : "Watch Episode";
        }
        const parts = stream.title.split("\n");
        if (parts.length > 1) {
            return parts[1];
        }
        return stream.title;
    }

    function getStreamDetails(stream: any) {
        if (!stream.title) return "";
        const parts = stream.title.split("\n");
        if (parts.length > 2) {
            return parts.slice(2).join(" ");
        }
        return "";
    }

    // Filter addons to only show those with stream resource
    $: filteredAddons = addons.filter((addon) => {
        if (!addon.manifest || !addon.manifest.resources) return false;
        return addon.manifest.resources.some(
            (resource: any) =>
                (typeof resource === "object" && resource.name === "stream") ||
                resource === "stream",
        );
    });
</script>

{#if streamsPopupVisible}
    <div
        class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-20"
        on:click|self={close}
        on:keydown={(e) => e.key === "Escape" && close()}
        role="button"
        tabindex="0"
        transition:fade={{ duration: 200 }}
    >
        <div
            class="bg-[#121212] w-full max-w-4xl max-h-full rounded-[32px] p-10 flex flex-col gap-6 overflow-hidden relative"
        >
            <button
                class="absolute top-6 right-6 text-white/50 hover:text-white cursor-pointer"
                on:click={close}
                aria-label="Close streams"
            >
                <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><line x1="18" y1="6" x2="6" y2="18"></line><line
                        x1="6"
                        y1="6"
                        x2="18"
                        y2="18"
                    ></line></svg
                >
            </button>

            <h2 class="text-white text-2xl font-poppins font-bold">
                Select Stream
            </h2>

            {#if filteredAddons.length > 1}
                <div class="flex flex-row gap-4 overflow-x-auto pb-2">
                    {#each filteredAddons as addon}
                        <button
                            class="px-6 py-3 rounded-full text-sm font-medium transition-colors cursor-pointer whitespace-nowrap {selectedAddon ===
                            addon.transport_url
                                ? 'bg-white text-black'
                                : 'bg-white/10 text-white hover:bg-white/20'}"
                            on:click={() =>
                                (selectedAddon = addon.transport_url)}
                        >
                            {addon.manifest.name}
                        </button>
                    {/each}
                </div>
            {/if}

            <div class="flex flex-col gap-4 overflow-y-auto pr-2">
                {#if loadingStreams}
                    <div class="text-white/50 text-center py-10">
                        Loading streams...
                    </div>
                {:else if streams.length === 0}
                    <div class="text-white/50 text-center py-10">
                        No streams found.
                    </div>
                {:else}
                    {#each streams as stream}
                        <button
                            class="w-full bg-white/5 hover:bg-white/10 p-4 rounded-xl flex flex-col gap-1 text-left transition-colors group cursor-pointer"
                            on:click={() => onStreamClick(stream)}
                        >
                            <div
                                class="flex flex-row justify-between items-center w-full"
                            >
                                <span class="text-white font-medium text-lg"
                                    >{truncateWords(
                                        getStreamTitle(stream),
                                        10,
                                    )}</span
                                >
                                <span class="text-white/50 text-sm"
                                    >{stream.name}</span
                                >
                            </div>
                            <span class="text-white/40 text-sm line-clamp-1"
                                >{getStreamDetails(stream)}</span
                            >
                        </button>
                    {/each}
                {/if}
            </div>
        </div>
    </div>
{/if}
