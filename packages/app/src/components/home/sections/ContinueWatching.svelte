<script lang="ts">
    import { router } from "../../../lib/stores/router";
    import { fade } from "svelte/transition";
    import WatchingContextMenu from "../context_menus/WatchingContextMenu.svelte";
    import {
        hideFromContinueWatching,
        forgetProgress,
    } from "../../../lib/db/db";
    import ListsPopup from "../../meta/modals/ListsPopup.svelte";
    import TrailerModal from "../../meta/modals/TrailerModal.svelte";
    import { getPrimaryTrailerId } from "../../../lib/home/trailers";

    import { onMount, onDestroy, tick } from "svelte";
    import { ChevronDown, ChevronLeft, ChevronRight } from "@lucide/svelte";
    import PosterImage from "./PosterImage.svelte";
    import { resumePoint, type ResumePoint, type WatchingItem } from "../../../lib/home/continueWatching";
    import { streamsToReopen } from "../../../pages/meta/metaState";
    import { previewAmbient } from "../../../lib/home/ambient";

    export let continueWatchingMeta: WatchingItem[] = [];

    function resume(item: WatchingItem, point: ResumePoint) {
        streamsToReopen.set({ imdbId: item.meta.imdb_id, episode: point.episode });
        router.navigate("meta", { imdbId: item.meta.imdb_id, type: item.meta.type });
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
        await hideFromContinueWatching(selectedImdbId);
        continueWatchingMeta = continueWatchingMeta.filter(
            (item) => item.meta.imdb_id !== selectedImdbId,
        );
    }

    async function handleForget() {
        if (!selectedImdbId) return;
        await forgetProgress(selectedImdbId);
        continueWatchingMeta = continueWatchingMeta.filter(
            (item) => item.meta.imdb_id !== selectedImdbId,
        );
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
            <h2 class="section-title text-ink text-[clamp(28px,2.2vw,44px)] font-semibold">
                Jump back into it
            </h2>

            <button
                class="ml-auto p-2 rounded-full hover:bg-ink/10 transition-colors duration-200 group/btn cursor-pointer"
                on:click={() => (isExpanded = !isExpanded)}
                aria-label={isExpanded ? "Collapse" : "Expand"}
            >
                <div class="transition-transform duration-300 {isExpanded ? 'rotate-180' : ''}">
                    <span class="expand-icon"><ChevronDown size={32} strokeWidth={2} /></span>
                </div>
            </button>
        </div>

        <div class="relative">
            {#if showLeftButton && !isExpanded}
                <button
                    class="rail-button absolute inset-y-3 left-0 z-20 flex items-center justify-center rounded-r-2xl bg-gradient-to-r from-canvas/90 to-canvas/35 text-ink backdrop-blur-sm transition-[background-color,opacity] duration-200 cursor-pointer"
                    on:click={scrollLeft}
                    aria-label="Scroll left"
                    transition:fade={{ duration: 200 }}
                >
                    <ChevronLeft size={24} strokeWidth={2} />
                </button>
            {/if}

            <div
                data-scroll-row
                class="gap-[20px] w-full pb-6 pt-3 transition-all duration-300 {isExpanded
                    ? 'watching-grid'
                    : 'flex flex-row overflow-x-auto overflow-y-visible no-scrollbar scroll-smooth'}"
                bind:this={scrollContainer}
                on:scroll={scheduleLayoutUpdate}
            >
                {#each renderedItems as title (`${title.meta.type}:${title.meta.imdb_id}`)}
                    {#if title.meta}
                        {@const point = resumePoint(title)}

                        <button
                            class="watching-card scheme-dark group/card relative aspect-video h-fit flex-shrink-0 cursor-pointer overflow-clip rounded-[18px] bg-surface p-0 text-left transition-[translate,box-shadow] duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_14px_30px_rgba(0,0,0,0.35)] focus-visible:-translate-y-1.5"
                            aria-label={`Resume ${title.meta.name}`}
                            on:click={() => resume(title, point)}
                            on:pointerenter={() => previewAmbient(point.image || title.meta.background)}
                            on:contextmenu={(e) =>
                                handleContextMenu(
                                    e,
                                    title.meta.imdb_id,
                                    title.meta.type,
                                    getPrimaryTrailerId(title.meta),
                                )}
                        >
                            <PosterImage
                                src={point.image || title.libraryItem.poster || title.meta.poster}
                                title={title.meta.name}
                                alt=""
                            />
                            <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent"></div>
                            <div class="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-[clamp(14px,1.1vw,20px)]">
                                {#if title.meta.logo}
                                    <img
                                        src={title.meta.logo}
                                        alt={title.meta.name}
                                        class="max-h-[clamp(30px,2.6vw,48px)] max-w-[60%] self-start object-contain object-left drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
                                        loading="lazy"
                                    />
                                {:else}
                                    <p class="line-clamp-1 text-lg font-semibold text-ink">{title.meta.name}</p>
                                {/if}
                                {#if point.detail}
                                    <p class="line-clamp-1 text-sm text-ink/75">{point.detail}</p>
                                {/if}
                                {#if point.progress !== null}
                                    <div class="mt-1 h-1 overflow-hidden rounded-full bg-ink/20">
                                        <div class="h-full rounded-full bg-accent" style="width: {point.progress * 100}%"></div>
                                    </div>
                                {/if}
                            </div>
                        </button>
                    {/if}
                {/each}
            </div>

            {#if showRightButton && !isExpanded}
                <button
                    class="rail-button absolute inset-y-3 right-0 z-20 flex items-center justify-center rounded-l-2xl bg-gradient-to-l from-canvas/90 to-canvas/35 text-ink backdrop-blur-sm transition-[background-color,opacity] duration-200 cursor-pointer"
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
    .expand-icon :global(svg) {
        width: clamp(24px, 1.7vw, 32px);
        height: clamp(24px, 1.7vw, 32px);
    }
    .rail-button {
        width: clamp(42px, 3vw, 56px);
    }
    .watching-card {
        width: clamp(260px, 22vw, 420px);
    }
    .watching-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(clamp(240px, 19vw, 380px), 1fr));
    }
    .watching-grid .watching-card {
        width: auto;
    }
</style>
