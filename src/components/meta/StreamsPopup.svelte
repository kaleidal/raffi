<script lang="ts">
    import { fade } from "svelte/transition";
    import { createEventDispatcher } from "svelte";
    import type { Addon } from "../../lib/db/db";
    import LoadingSpinner from "../common/LoadingSpinner.svelte";

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
                <div class="flex flex-wrap gap-3 pb-2">
                    {#each filteredAddons as addon}
                        <button
                            class="px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer whitespace-nowrap {selectedAddon ===
                            addon.transport_url
                                ? 'bg-white text-black border-white shadow-lg shadow-white/10'
                                : 'bg-[#1A1A1A] text-[#A0A0A0] border-[#333] hover:border-[#555] hover:text-white'}"
                            on:click={() =>
                                (selectedAddon = addon.transport_url)}
                        >
                            {addon.manifest.name}
                        </button>
                    {/each}
                </div>
            {/if}

            <div
                class="flex flex-col gap-4 overflow-y-auto pr-2 flex-1 min-h-0"
            >
                {#if loadingStreams}
                    <div class="flex justify-center py-10">
                        <LoadingSpinner size="40px" />
                    </div>
                {:else if streams.length === 0}
                    <div class="text-white/50 text-center py-10">
                        No streams found.
                    </div>
                {:else}
                    {#each streams as stream}
                        <button
                            class="w-full bg-[#1A1A1A] hover:bg-[#222] p-5 rounded-2xl flex flex-col gap-2 text-left transition-all duration-200 group cursor-pointer relative overflow-hidden shrink-0"
                            on:click={() => onStreamClick(stream)}
                        >
                            <div
                                class="flex flex-row justify-between items-start w-full gap-4"
                            >
                                <div class="flex-1 min-w-0">
                                    <h3
                                        class="text-white font-medium text-lg line-clamp-2 leading-snug"
                                        title={getStreamTitle(stream)}
                                    >
                                        {getStreamTitle(stream)}
                                    </h3>
                                </div>
                                <div
                                    class="flex flex-col items-end gap-1 shrink-0"
                                >
                                    {#if stream.infoHash || (stream.url && stream.url.startsWith("magnet:"))}
                                        <div
                                            class="bg-green-500/10 text-green-400 px-2 py-1 rounded-md text-[10px] font-bold border border-green-500/20 flex items-center gap-1 uppercase tracking-wider"
                                        >
                                            P2P
                                        </div>
                                    {/if}
                                    <span class="text-[#888] text-xs font-mono"
                                        >{stream.name}</span
                                    >
                                </div>
                            </div>
                            <div
                                class="flex flex-row items-center gap-2 w-full"
                            >
                                <span
                                    class="text-[#666] text-sm truncate font-medium w-full"
                                >
                                    {getStreamDetails(stream)}
                                </span>
                            </div>
                        </button>
                    {/each}
                {/if}
            </div>
        </div>
    </div>
{/if}
