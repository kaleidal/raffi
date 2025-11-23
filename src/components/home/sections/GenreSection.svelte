<script lang="ts">
    import type { PopularTitleMeta } from "../../../lib/library/types/popular_types";
    import { router } from "../../../lib/stores/router";
    import { fade } from "svelte/transition";
    import TitleContextMenu from "../context_menus/TitleContextMenu.svelte";
    import ListsPopup from "../../meta/ListsPopup.svelte";
    import { onMount } from "svelte";

    export let genre: string;
    export let titles: PopularTitleMeta[];

    let scrollContainer: HTMLDivElement;
    let showLeftButton = false;
    let showRightButton = false;
    let showContextMenu = false;
    let contextMenuX = 0;
    let contextMenuY = 0;
    let selectedImdbId = "";
    let selectedType = "";
    let showListsPopup = false;

    function checkScroll() {
        if (!scrollContainer) return;
        showLeftButton = scrollContainer.scrollLeft > 0;
        showRightButton =
            scrollContainer.scrollLeft + scrollContainer.clientWidth <
            scrollContainer.scrollWidth - 10;
    }

    function scrollLeft() {
        scrollContainer.scrollBy({ left: -800, behavior: "smooth" });
        setTimeout(checkScroll, 300);
    }

    function scrollRight() {
        scrollContainer.scrollBy({ left: 800, behavior: "smooth" });
        setTimeout(checkScroll, 300);
    }

    function handleContextMenu(e: MouseEvent, imdbId: string, type: string) {
        e.preventDefault();
        contextMenuX = e.clientX;
        contextMenuY = e.clientY;
        selectedImdbId = imdbId;
        selectedType = type;
        showContextMenu = true;
    }

    function handleAddToList() {
        showContextMenu = false;
        showListsPopup = true;
    }

    onMount(() => {
        setTimeout(checkScroll, 100);
    });
</script>

{#if showContextMenu}
    <TitleContextMenu
        x={contextMenuX}
        y={contextMenuY}
        on:close={() => (showContextMenu = false)}
        on:addToList={handleAddToList}
    />
{/if}

<ListsPopup
    bind:visible={showListsPopup}
    imdbId={selectedImdbId}
    type={selectedType}
    on:close={() => (showListsPopup = false)}
/>

<div class="w-full h-fit flex flex-col gap-4 relative group">
    <h2 class="text-[#E0E0E6] text-[48px] font-poppins font-semibold">
        {genre}
    </h2>

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
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M15 18L9 12L15 6"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            </button>
        {/if}

        <div
            bind:this={scrollContainer}
            on:scroll={checkScroll}
            class="flex flex-row gap-[20px] overflow-x-scroll no-scrollbar scroll-smooth"
        >
            {#each titles as title}
                <button
                    class="w-[200px] aspect-[2/3] h-fit rounded-[16px] hover:opacity-80 transition-all duration-200 ease-out cursor-pointer overflow-clip relative flex-shrink-0"
                    on:click={() => {
                        router.navigate("meta", {
                            imdbId: title.imdb_id,
                            type: title.type,
                        });
                    }}
                    on:contextmenu={(e) =>
                        handleContextMenu(e, title.imdb_id, title.type)}
                >
                    <img
                        src={title.poster}
                        alt={title.name}
                        class="w-full h-full object-cover"
                    />
                </button>
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
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M9 18L15 12L9 6"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            </button>
        {/if}
    </div>
</div>

<style>
    .no-scrollbar::-webkit-scrollbar {
        display: none;
    }
    .no-scrollbar {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
</style>
