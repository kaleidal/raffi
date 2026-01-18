<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import type { ShowResponse } from "../../lib/library/types/meta_types";
    import { FileVideo, Eye } from "lucide-svelte";

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
            class="group bg-[#121212] rounded-[20px] overflow-hidden cursor-pointer transition-all duration-200 ease-out relative hover:-translate-y-1.5 hover:shadow-[0_14px_30px_rgba(0,0,0,0.35)] hover:bg-[#171717] {isWatched
                ? 'opacity-60'
                : 'hover:opacity-95'}"

            on:click={() => handleEpisodeClick(episode)}
            on:contextmenu|preventDefault={(e) =>
                dispatch("episodeContextMenu", { event: e, episode })}
        >
            <div
                class="w-full h-[150px] bg-gradient-to-t from-[#090909] to-transparent absolute bottom-0 left-0 z-10"
            ></div>

            {#if episode.thumbnail && !failedImages.has(epKey)}
                <img
                    src={episode.thumbnail}
                    alt="Episode Thumbnail"
                    class="w-full h-full object-cover aspect-video transition-transform duration-200 relative z-0 {isWatched
                        ? 'grayscale'
                        : 'group-hover:scale-[1.02]'}"
                    on:error={() => handleImageError(epKey)}
                />
            {:else}
                <div
                    class="w-full aspect-video bg-[#1a1a1a] flex items-start justify-center pt-[30px]"
                >
                    <div class="opacity-20">
                        <FileVideo size={40} strokeWidth={2} color="white" />
                    </div>
                </div>
            {/if}

            {#if isWatched}
                <div
                    class="absolute top-2 right-2 bg-black/50 p-1 rounded-full"
                >
                    <Eye size={20} strokeWidth={2} color="white" />
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
