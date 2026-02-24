<script lang="ts">
    import type { PopularTitleMeta } from "../../../lib/library/types/popular_types";
    import { router } from "../../../lib/stores/router";

    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { Flame, ChevronLeft, ChevronRight } from "lucide-svelte";
    import TitleContextMenu from "../context_menus/TitleContextMenu.svelte";
    import ListsPopup from "../../meta/modals/ListsPopup.svelte";
    import PosterImage from "./PosterImage.svelte";

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
            <Flame size={50} strokeWidth={3} color="#FF8F3C" />

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
                    <ChevronLeft size={24} strokeWidth={2} />
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
                        <PosterImage
                            src={title.poster}
                            title={title.name}
                            alt={title.name || "Popular title poster"}
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
                    <ChevronRight size={24} strokeWidth={2} />
                </button>
            {/if}
        </div>
    </div>
{/if}
