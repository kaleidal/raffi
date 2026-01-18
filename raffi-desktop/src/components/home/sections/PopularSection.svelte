<script lang="ts">
    import type { PopularTitleMeta } from "../../../lib/library/types/popular_types";
    import { router } from "../../../lib/stores/router";

    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import TitleContextMenu from "../context_menus/TitleContextMenu.svelte";
    import ListsPopup from "../../meta/modals/ListsPopup.svelte";

    export let popularMeta: PopularTitleMeta[] = [];

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
        updateScrollButtons();
        window.addEventListener("resize", updateScrollButtons);
        return () => window.removeEventListener("resize", updateScrollButtons);
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

{#if popularMeta.length > 0}
    <div class="w-full h-fit flex flex-col gap-4 relative group overflow-visible">
        <div class="flex flex-row gap-[10px] items-center">
            <svg
                width="50"
                height="50"
                viewBox="0 0 50 50"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    d="M17.7083 30.2083C19.0897 30.2083 20.4144 29.6596 21.3912 28.6828C22.3679 27.7061 22.9167 26.3813 22.9167 25C22.9167 22.125 21.875 20.8333 20.8333 18.75C18.6 14.2854 20.3667 10.3042 25 6.25C26.0417 11.4583 29.1667 16.4583 33.3333 19.7917C37.5 23.125 39.5833 27.0833 39.5833 31.25C39.5833 33.1651 39.2061 35.0615 38.4732 36.8308C37.7404 38.6001 36.6662 40.2078 35.312 41.562C33.9578 42.9162 32.3501 43.9904 30.5808 44.7232C28.8115 45.4561 26.9151 45.8333 25 45.8333C23.0849 45.8333 21.1885 45.4561 19.4192 44.7232C17.6499 43.9904 16.0422 42.9162 14.688 41.562C13.3338 40.2078 12.2596 38.6001 11.5268 36.8308C10.7939 35.0615 10.4167 33.1651 10.4167 31.25C10.4167 28.8479 11.3188 26.4708 12.5 25C12.5 26.3813 13.0487 27.7061 14.0255 28.6828C15.0022 29.6596 16.327 30.2083 17.7083 30.2083Z"
                    stroke="#FF8F3C"
                    stroke-width="4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>

            <h1 class="font-poppins text-[#FF8F3C] font-medium text-[48px]">
                Popular
            </h1>
        </div>

        <div class="relative overflow-visible">
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
                class="flex flex-row gap-[20px] overflow-x-auto overflow-y-visible w-full pb-6 pt-3 no-scrollbar scroll-smooth"
                bind:this={scrollContainer}
                on:scroll={updateScrollButtons}
            >
                {#each popularMeta as title}
                    <button
                        class="w-[200px] h-fit rounded-[16px] hover:opacity-90 transition-all duration-200 ease-out cursor-pointer overflow-clip relative flex-shrink-0 hover:-translate-y-1.5 hover:shadow-[0_14px_30px_rgba(0,0,0,0.35)]"

                        on:click={() =>
                            navigateToMeta(title.imdb_id, title.type)}
                        on:contextmenu={(e) =>
                            handleContextMenu(e, title.imdb_id, title.type)}
                    >
                        <img
                            src={title.poster}
                            alt=""
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
