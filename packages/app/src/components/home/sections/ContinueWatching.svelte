<script lang="ts">
    import type { ShowResponse } from "../../../lib/library/types/meta_types";
    import { router } from "../../../lib/stores/router";
    import { fade } from "svelte/transition";
    import WatchingContextMenu from "../context_menus/WatchingContextMenu.svelte";
    import {
        hideFromContinueWatching,
        forgetProgress,
    } from "../../../lib/db/db";
    import ListsPopup from "../../meta/modals/ListsPopup.svelte";
    import TrailerModal from "../../meta/modals/TrailerModal.svelte";
    import { getPrimaryTrailerId } from "../../../lib/trailers";

    import { onMount, onDestroy, tick } from "svelte";
    import { Play, ChevronDown, ChevronLeft, ChevronRight } from "@lucide/svelte";
    import PosterImage from "./PosterImage.svelte";
 
    export let continueWatchingMeta: (ShowResponse & { libraryItem: any })[] =
        [];

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
    let isExpanded = false;
    let resizeObserver: ResizeObserver | null = null;
    let visibleCount = 24;
    let previousItems = continueWatchingMeta;
    let scrollFrame: number | null = null;

    const BATCH_SIZE = 24;
    const LOAD_AHEAD_PX = 1200;

    $: renderedItems = isExpanded
        ? continueWatchingMeta
        : continueWatchingMeta.slice(0, visibleCount);
    $: if (continueWatchingMeta !== previousItems) {
        previousItems = continueWatchingMeta;
        visibleCount = Math.min(BATCH_SIZE, continueWatchingMeta.length);
        scheduleLayoutUpdate();
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

    function handleViewTrailer() {
        if (!selectedTrailerId) return;
        showContextMenu = false;
        showTrailerModal = true;
    }

    function updateScrollButtons() {
        if (scrollContainer) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollContainer;
            showLeftButton = scrollLeft > 0;
            showRightButton =
                visibleCount < continueWatchingMeta.length ||
                scrollLeft + clientWidth < scrollWidth - 1;

            if (
                !isExpanded &&
                scrollWidth - scrollLeft - clientWidth < LOAD_AHEAD_PX
            ) {
                revealMore();
            }
        }
    }

    function scheduleLayoutUpdate() {
        if (typeof requestAnimationFrame === "undefined" || scrollFrame !== null) return;
        scrollFrame = requestAnimationFrame(() => {
            scrollFrame = null;
            updateScrollButtons();
        });
    }

    function revealMore() {
        if (visibleCount >= continueWatchingMeta.length) return;
        visibleCount = Math.min(
            visibleCount + BATCH_SIZE,
            continueWatchingMeta.length,
        );
        void tick().then(scheduleLayoutUpdate);
    }

    function scrollLeft() {
        if (scrollContainer) {
            scrollContainer.scrollBy({ left: -500, behavior: "smooth" });
        }
    }

    async function scrollRight() {
        if (scrollContainer) {
            if (
                visibleCount < continueWatchingMeta.length &&
                scrollContainer.scrollLeft + scrollContainer.clientWidth + 600 >=
                    scrollContainer.scrollWidth
            ) {
                revealMore();
                await tick();
            }
            scrollContainer.scrollBy({ left: 500, behavior: "smooth" });
        }
    }

    function attachResizeObserver() {
        if (typeof ResizeObserver === "undefined") return;
        if (!scrollContainer) return;
        if (resizeObserver) return;

        resizeObserver = new ResizeObserver(scheduleLayoutUpdate);
        resizeObserver.observe(scrollContainer);
    }

    async function recomputeAfterRender() {
        await tick();
        requestAnimationFrame(() => {
            attachResizeObserver();
            updateScrollButtons();
        });
    }

    onMount(() => {
        void recomputeAfterRender();

        window.addEventListener("resize", scheduleLayoutUpdate);
    });

    onDestroy(() => {
        window.removeEventListener("resize", scheduleLayoutUpdate);
        resizeObserver?.disconnect();
        resizeObserver = null;
        if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
    });

    $: if (continueWatchingMeta.length) {
        void recomputeAfterRender();
    }

    $: if (scrollContainer && continueWatchingMeta.length) {
        attachResizeObserver();
    }
</script>

{#if showContextMenu}
    <WatchingContextMenu
        x={contextMenuX}
        y={contextMenuY}
        showTrailer={Boolean(selectedTrailerId)}
        onClose={() => (showContextMenu = false)}
        onRemove={handleRemove}
        onForget={handleForget}
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

{#if continueWatchingMeta.length > 0}
    <div class="home-section w-full h-fit flex flex-col gap-4 relative group overflow-visible">
        <div class="flex flex-row gap-[10px] items-center w-full">
            <span class="section-icon"><Play size={50} strokeWidth={3} color="#E0E0E6" /></span>

            <h1 class="section-title font-poppins text-[#E0E0E6] font-medium text-[clamp(30px,2.5vw,48px)]">
                Jump back into it
            </h1>

            <button
                class="ml-auto p-2 rounded-full hover:bg-white/10 transition-colors duration-200 group/btn cursor-pointer"
                on:click={() => (isExpanded = !isExpanded)}
                aria-label={isExpanded ? "Collapse" : "Expand"}
            >
                <div class="transition-transform duration-300 {isExpanded ? 'rotate-180' : ''}">
                    <span class="expand-icon"><ChevronDown size={32} strokeWidth={2} color="#E0E0E6" /></span>
                </div>
            </button>
        </div>

        <div class="relative">
            {#if showLeftButton && !isExpanded}
                <button
                    class="rail-button absolute inset-y-3 left-0 z-20 flex items-center justify-center rounded-r-2xl bg-gradient-to-r from-black/90 to-black/35 text-white backdrop-blur-sm transition-[background-color,opacity] duration-200 cursor-pointer"
                    on:click={scrollLeft}
                    aria-label="Scroll left"
                    transition:fade={{ duration: 200 }}
                >
                    <ChevronLeft size={24} strokeWidth={2} />
                </button>
            {/if}

            <div
                class="flex gap-[20px] w-full pb-6 pt-3 transition-all duration-300 {isExpanded
                    ? 'flex-wrap'
                    : 'flex-row overflow-x-auto overflow-y-visible no-scrollbar scroll-smooth'}"
                bind:this={scrollContainer}
                on:scroll={scheduleLayoutUpdate}
            >
                {#each renderedItems as title (`${title.meta.type}:${title.meta.imdb_id}`)}
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
                            class="group/poster w-[clamp(150px,13vw,200px)] aspect-[2/3] h-fit appearance-none border-0 bg-transparent p-0 rounded-[16px] transition-[width,transform,box-shadow] duration-300 ease-out cursor-pointer overflow-clip relative flex-shrink-0 hover:-translate-y-1.5 hover:shadow-[0_14px_30px_rgba(0,0,0,0.35)] focus-visible:-translate-y-1.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70"
                            aria-label={`Open ${title.meta.name || "continue watching title"}`}

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
                                    getPrimaryTrailerId(title.meta),
                                )}
                        >
                            <PosterImage
                                src={title.libraryItem.poster ||
                                    title.meta.poster}
                                title={title.meta.name}
                                year={title.meta.year || title.meta.releaseInfo}
                                alt={title.meta.name || "Continue Watching poster"}
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

            {#if showRightButton && !isExpanded}
                <button
                    class="rail-button absolute inset-y-3 right-0 z-20 flex items-center justify-center rounded-l-2xl bg-gradient-to-l from-black/90 to-black/35 text-white backdrop-blur-sm transition-[background-color,opacity] duration-200 cursor-pointer"
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
    .expand-icon :global(svg) {
        width: clamp(24px, 1.7vw, 32px);
        height: clamp(24px, 1.7vw, 32px);
    }
    .rail-button {
        width: clamp(42px, 3vw, 56px);
    }
</style>
