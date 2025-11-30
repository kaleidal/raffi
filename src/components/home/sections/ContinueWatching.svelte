<script lang="ts">
    import type { ShowResponse } from "../../../lib/library/types/meta_types";
    import { router } from "../../../lib/stores/router";
    import { fade } from "svelte/transition";
    import WatchingContextMenu from "../context_menus/WatchingContextMenu.svelte";
    import {
        hideFromContinueWatching,
        forgetProgress,
        updateLibraryProgress,
    } from "../../../lib/db/db";
    import ListsPopup from "../../meta/modals/ListsPopup.svelte";

    import { onMount } from "svelte";

    export let continueWatchingMeta: (ShowResponse & { libraryItem: any })[] =
        [];

    $: {
        continueWatchingMeta.forEach(async (item) => {
            if (
                item.meta &&
                item.meta.poster &&
                !item.libraryItem.poster &&
                item.libraryItem.imdb_id
            ) {
                try {
                    await updateLibraryProgress(
                        item.libraryItem.imdb_id,
                        item.libraryItem.progress,
                        item.libraryItem.type,
                        undefined,
                        item.meta.poster,
                    );
                    item.libraryItem.poster = item.meta.poster;
                } catch (e) {
                    console.error("Failed to backfill poster", e);
                }
            }
        });
    }

    function navigateToMeta(imdbId: string, type: string) {
        router.navigate("meta", { imdbId, type });
    }
    let scrollContainer: HTMLDivElement;
    let showLeftButton = false;
    let showRightButton = false;

    let showContextMenu = false;
    let contextMenuX = 0;
    let contextMenuY = 0;
    let selectedImdbId = "";
    let selectedType = "";
    let showListsPopup = false;

    function handleContextMenu(e: MouseEvent, imdbId: string, type: string) {
        e.preventDefault();
        contextMenuX = e.clientX;
        contextMenuY = e.clientY;
        selectedImdbId = imdbId;
        selectedType = type;
        showContextMenu = true;
    }

    async function handleRemove() {
        if (!selectedImdbId) return;
        try {
            await hideFromContinueWatching(selectedImdbId);
            continueWatchingMeta = continueWatchingMeta.filter(
                (item) => item.meta.imdb_id !== selectedImdbId,
            );
        } catch (e) {
            console.error("Failed to remove item", e);
        }
    }

    async function handleForget() {
        if (!selectedImdbId) return;
        try {
            await forgetProgress(selectedImdbId);
            continueWatchingMeta = continueWatchingMeta.filter(
                (item) => item.meta.imdb_id !== selectedImdbId,
            );
        } catch (e) {
            console.error("Failed to forget item", e);
        }
    }

    function handleAddToList() {
        showContextMenu = false;
        showListsPopup = true;
    }

    function updateScrollButtons() {
        if (scrollContainer) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollContainer;
            showLeftButton = scrollLeft > 0;
            showRightButton = scrollLeft + clientWidth < scrollWidth - 1;
        }
    }

    function scrollLeft() {
        if (scrollContainer) {
            scrollContainer.scrollBy({ left: -500, behavior: "smooth" });
        }
    }

    function scrollRight() {
        if (scrollContainer) {
            scrollContainer.scrollBy({ left: 500, behavior: "smooth" });
        }
    }

    onMount(() => {
        updateScrollButtons();
        window.addEventListener("resize", updateScrollButtons);
        return () => window.removeEventListener("resize", updateScrollButtons);
    });
</script>

{#if showContextMenu}
    <WatchingContextMenu
        x={contextMenuX}
        y={contextMenuY}
        on:close={() => (showContextMenu = false)}
        on:remove={handleRemove}
        on:forget={handleForget}
        on:addToList={handleAddToList}
    />
{/if}

<ListsPopup
    bind:visible={showListsPopup}
    imdbId={selectedImdbId}
    type={selectedType}
    on:close={() => (showListsPopup = false)}
/>

{#if continueWatchingMeta.length > 0}
    <div class="w-full h-fit flex flex-col gap-4 relative group">
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

        <div class="relative">
            {#if showLeftButton}
                <button
                    class="absolute h-full left-[-25px] top-1/2 -translate-y-1/2 z-20 bg-black/50 hover:bg-black/80 backdrop-blur-md text-white p-3 transition-all duration-200 cursor-pointer"
                    on:click={scrollLeft}
                    aria-label="Scroll left"
                    transition:fade={{ duration: 200 }}
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
                        ><polyline points="15 18 9 12 15 6"></polyline></svg
                    >
                </button>
            {/if}

            <div
                class="flex flex-row gap-[20px] overflow-x-auto w-full pb-4 no-scrollbar scroll-smooth"
                bind:this={scrollContainer}
                on:scroll={updateScrollButtons}
            >
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
                            class="w-[200px] h-fit rounded-[16px] hover:opacity-80 transition-all duration-200 ease-out cursor-pointer overflow-clip relative flex-shrink-0"
                            on:click={() =>
                                navigateToMeta(
                                    title.meta.imdb_id,
                                    title.meta.type,
                                )}
                            on:contextmenu={(e) =>
                                handleContextMenu(
                                    e,
                                    title.meta.imdb_id,
                                    title.meta.type,
                                )}
                        >
                            <img
                                src={title.libraryItem.poster ||
                                    title.meta.poster}
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

            {#if showRightButton}
                <button
                    class="absolute h-full right-[-25px] top-1/2 -translate-y-1/2 z-20 bg-black/50 hover:bg-black/80 backdrop-blur-md text-white p-3 transition-all duration-200 cursor-pointer"
                    on:click={scrollRight}
                    aria-label="Scroll right"
                    transition:fade={{ duration: 200 }}
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
                        ><polyline points="9 18 15 12 9 6"></polyline></svg
                    >
                </button>
            {/if}
        </div>
    </div>
{/if}
