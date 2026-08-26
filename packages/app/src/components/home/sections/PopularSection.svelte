<script lang="ts">
    import type { PopularTitleMeta } from "../../../lib/library/types/popular_types";
    import { router } from "../../../lib/stores/router";

    import { onDestroy, onMount, tick } from "svelte";
    import { fade } from "svelte/transition";
    import { Flame, ChevronLeft, ChevronRight } from "@lucide/svelte";
    import TitleContextMenu from "../context_menus/TitleContextMenu.svelte";
    import ListsPopup from "../../meta/modals/ListsPopup.svelte";
    import TrailerModal from "../../meta/modals/TrailerModal.svelte";
    import PosterImage from "./PosterImage.svelte";
    import { getPrimaryTrailerId } from "../../../lib/trailers";

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
    let selectedTrailerId = "";
    let showListsPopup = false;
    let showTrailerModal = false;
    let visibleCount = 24;
    let previousTitles = popularMeta;
    let scrollFrame: number | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const BATCH_SIZE = 24;
    const LOAD_AHEAD_PX = 1200;

    $: renderedTitles = popularMeta.slice(0, visibleCount);
    $: if (popularMeta !== previousTitles) {
        previousTitles = popularMeta;
        visibleCount = Math.min(BATCH_SIZE, popularMeta.length);
        scheduleScrollCheck();
    }

    function updateScrollButtons() {
        if (scrollContainer) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollContainer;
            showLeftButton = scrollLeft > 0;
            showRightButton =
                visibleCount < popularMeta.length ||
                scrollLeft + clientWidth < scrollWidth - 1;

            if (scrollWidth - scrollLeft - clientWidth < LOAD_AHEAD_PX) {
                revealMore();
            }
        }
    }

    function scheduleScrollCheck() {
        if (typeof requestAnimationFrame === "undefined" || scrollFrame !== null) return;
        scrollFrame = requestAnimationFrame(() => {
            scrollFrame = null;
            updateScrollButtons();
        });
    }

    function revealMore() {
        if (visibleCount >= popularMeta.length) return;
        visibleCount = Math.min(visibleCount + BATCH_SIZE, popularMeta.length);
        void tick().then(scheduleScrollCheck);
    }

    function scrollLeft() {
        if (scrollContainer) {
            scrollContainer.scrollBy({ left: -500, behavior: "smooth" });
        }
    }

    async function scrollRight() {
        if (scrollContainer) {
            if (
                visibleCount < popularMeta.length &&
                scrollContainer.scrollLeft + scrollContainer.clientWidth + 600 >=
                    scrollContainer.scrollWidth
            ) {
                revealMore();
                await tick();
            }
            scrollContainer.scrollBy({ left: 500, behavior: "smooth" });
        }
    }

    function handleContextMenu(e: MouseEvent, imdbId: string, type: string, trailerId: string | null) {
        e.preventDefault();
        contextMenuX = e.clientX;
        contextMenuY = e.clientY;
        selectedImdbId = imdbId;
        selectedType = type;
        selectedTrailerId = trailerId || "";
        showContextMenu = true;
    }

    function handleAddToList() {
        showContextMenu = false;
        showListsPopup = true;
    }

    function handleViewTrailer() {
        if (!selectedTrailerId) return;
        showContextMenu = false;
        showTrailerModal = true;
    }

    onMount(() => {
        resizeObserver = new ResizeObserver(scheduleScrollCheck);
        resizeObserver.observe(scrollContainer);
        scheduleScrollCheck();
    });

    onDestroy(() => {
        resizeObserver?.disconnect();
        if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
    });
</script>

{#if showContextMenu}
    <TitleContextMenu
        x={contextMenuX}
        y={contextMenuY}
        showTrailer={Boolean(selectedTrailerId)}
        onClose={() => (showContextMenu = false)}
        onAddToList={handleAddToList}
        onViewTrailer={handleViewTrailer}
    />
{/if}

<ListsPopup
    bind:visible={showListsPopup}
    imdbId={selectedImdbId}
    type={selectedType}
/>

{#if selectedTrailerId}
    <TrailerModal
        bind:visible={showTrailerModal}
        ytId={selectedTrailerId}
    />
{/if}

{#if popularMeta.length > 0}
    <div class="home-section w-full h-fit flex flex-col gap-4 relative group overflow-visible">
        <div class="flex flex-row gap-[10px] items-center">
            <span class="section-icon"><Flame size={50} strokeWidth={3} color="#FF8F3C" /></span>

            <h1 class="section-title font-poppins text-[#FF8F3C] font-medium text-[clamp(30px,2.5vw,48px)]">
                Popular
            </h1>
        </div>

        <div class="relative overflow-visible">
            {#if showLeftButton}
                <button
                    class="rail-button absolute inset-y-3 left-0 z-20 flex items-center justify-center rounded-r-2xl bg-gradient-to-r from-black/90 to-black/35 text-white backdrop-blur-sm transition-opacity duration-200 cursor-pointer"
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
                on:scroll={scheduleScrollCheck}
            >
                {#each renderedTitles as title (`${title.type}:${title.imdb_id}`)}
                    <button
                        class="group/poster w-[clamp(150px,13vw,200px)] aspect-[2/3] h-fit appearance-none border-0 bg-transparent p-0 rounded-[16px] hover:opacity-90 transition-[width,transform,opacity,box-shadow] duration-300 ease-out cursor-pointer overflow-clip relative flex-shrink-0 hover:-translate-y-1.5 hover:shadow-[0_14px_30px_rgba(0,0,0,0.35)] focus-visible:-translate-y-1.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70"
                        aria-label={`Open ${title.name}`}

                        on:click={() =>
                            navigateToMeta(title.imdb_id, title.type)}
                        on:contextmenu={(e) =>
                            handleContextMenu(
                                e,
                                title.imdb_id,
                                title.type,
                                getPrimaryTrailerId(title),
                            )}
                    >
                        <PosterImage
                            src={title.poster}
                            title={title.name}
                            year={title.year || title.releaseInfo}
                            alt={title.name || "Popular title poster"}
                        />
                    </button>
                {/each}
            </div>

            {#if showRightButton}
                <button
                    class="rail-button absolute inset-y-3 right-0 z-20 flex items-center justify-center rounded-l-2xl bg-gradient-to-l from-black/90 to-black/35 text-white backdrop-blur-sm transition-opacity duration-200 cursor-pointer"
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

<style>
    .home-section {
        content-visibility: auto;
        contain-intrinsic-size: auto 390px;
    }
    .section-title {
        transition: font-size 300ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .section-icon :global(svg) {
        width: clamp(32px, 2.6vw, 50px);
        height: clamp(32px, 2.6vw, 50px);
        transition: width 300ms cubic-bezier(0.22, 1, 0.36, 1), height 300ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .rail-button {
        width: clamp(42px, 3vw, 56px);
    }
</style>
