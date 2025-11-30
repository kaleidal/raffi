<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import type { ShowResponse } from "../../lib/library/types/meta_types";

    export let metaData: ShowResponse;
    export let currentSeason: number;
    export let progressMap: any = {};

    const dispatch = createEventDispatcher();

    function truncateWords(text: string, maxWords: number) {
        if (!text) return "";
        const words = text.split(/\s+/);
        if (words.length <= maxWords) return text;
        return words.slice(0, maxWords).join(" ") + "…";
    }

    function handleEpisodeClick(episode: any) {
        dispatch("episodeClick", episode);
    }

    let failedImages = new Set<string>();

    function handleImageError(id: string) {
        failedImages.add(id);
        failedImages = failedImages; // Trigger reactivity
    }
</script>

<div class="grid grid-cols-4 gap-[30px]">
    {#each metaData.meta.videos.filter((video) => video.season === currentSeason) as episode}
        {@const epKey = `${episode.season}:${episode.episode}`}
        {@const epProgress = progressMap[epKey]}
        {@const isWatched = epProgress && epProgress.watched}

        <button
            class="bg-[#121212] rounded-[20px] overflow-hidden cursor-pointer hover:opacity-80 transition-opacity duration-200 relative {isWatched
                ? 'opacity-60'
                : ''}"
            on:click={() => handleEpisodeClick(episode)}
            on:contextmenu|preventDefault={(e) =>
                dispatch("episodeContextMenu", { event: e, episode })}
        >
            <div
                class="w-full h-[150px] bg-gradient-to-t from-[#090909] to-transparent absolute bottom-0 left-0"
            ></div>

            {#if episode.thumbnail && !failedImages.has(epKey)}
                <img
                    src={episode.thumbnail}
                    alt="Episode Thumbnail"
                    class="w-full h-full object-cover aspect-video {isWatched
                        ? 'grayscale'
                        : ''}"
                    on:error={() => handleImageError(epKey)}
                />
            {:else}
                <div
                    class="w-full aspect-video bg-[#1a1a1a] flex items-start justify-center pt-[30px]"
                >
                    <svg
                        width="40"
                        height="40"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        class="opacity-20"
                    >
                        <path
                            d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                            stroke="white"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                        <path
                            d="M10 8L16 12L10 16V8Z"
                            stroke="white"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>
                </div>
            {/if}

            {#if isWatched}
                <div
                    class="absolute top-2 right-2 bg-black/50 p-1 rounded-full"
                >
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="white"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                        ></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                </div>
            {/if}

            {#if epProgress && !isWatched && epProgress.time > 0}
                <div
                    class="absolute bottom-0 left-0 h-[4px] bg-[#676767] z-20"
                    style="width: {(epProgress.time / epProgress.duration) *
                        100}%"
                ></div>
            {/if}

            <div
                class="p-5 flex flex-col justify-end gap-[10px] z-10 absolute w-full h-full top-0 left-0"
            >
                <span
                    class="text-[#E1E1E1] text-[18px] font-poppins font-semibold"
                    >S{episode.season}E{episode.episode} - {episode.name}</span
                >
                <span
                    class="text-[#A3A3A3] text-[14px] font-poppins font-medium"
                    >{truncateWords(episode.description ?? "", 10)}</span
                >
            </div>
        </button>
    {/each}
</div>
