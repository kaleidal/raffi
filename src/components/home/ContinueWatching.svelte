<script lang="ts">
    import type { ShowResponse } from "../../lib/library/types/meta_types";
    import { router } from "../../lib/stores/router";

    export let continueWatchingMeta: (ShowResponse & { libraryItem: any })[] =
        [];

    function navigateToMeta(imdbId: string, type: string) {
        router.navigate("meta", { imdbId, type });
    }
</script>

{#if continueWatchingMeta.length > 0}
    <div class="w-full h-fit flex flex-col gap-4">
        <div class="flex flex-row gap-[10px] items-center">
            <svg
                width="50"
                height="50"
                viewBox="0 0 50 50"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    d="M12.5 6.25L41.6667 25L12.5 43.75V6.25Z"
                    stroke="#E0E0E6"
                    stroke-width="4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>

            <h1 class="font-poppins text-[#E0E0E6] font-medium text-[48px]">
                Jump back into it
            </h1>
        </div>
        <div class="flex flex-row gap-[20px]">
            {#each continueWatchingMeta as title}
                {#if title.meta}
                    {@const progress = title.libraryItem.progress}
                    {@const isMovie = title.meta.type === "movie"}
                    {@const movieProgress = isMovie ? progress : null}
                    {@const isMovieResumable =
                        isMovie &&
                        movieProgress &&
                        !movieProgress.watched &&
                        movieProgress.time > 0}

                    <button
                        class="w-[200px] h-fit rounded-[16px] hover:opacity-80 transition-all duration-200 ease-out cursor-pointer overflow-clip relative"
                        on:click={() =>
                            navigateToMeta(title.meta.imdb_id, title.meta.type)}
                    >
                        <img
                            src={title.meta.poster}
                            alt=""
                            class="w-full h-full object-cover"
                        />
                        {#if isMovieResumable}
                            <div
                                class="absolute bottom-0 left-0 h-[4px] bg-[#676767] z-20"
                                style="width: {(movieProgress.time /
                                    movieProgress.duration) *
                                    100}%"
                            ></div>
                        {/if}
                    </button>
                {/if}
            {/each}
        </div>
    </div>
{/if}
