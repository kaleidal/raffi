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
    import { Play, ChevronDown, ChevronLeft, ChevronRight } from "lucide-svelte";
 
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
    let isExpanded = false;

    const BASE_CARD_WIDTH = 200;
    const MAX_CARD_WIDTH_DELTA = 50;
    const CARD_GAP_PX = 20;

    function recomputeCardWidth() {
        if (!scrollContainer) return;

        const containerWidth = scrollContainer.clientWidth;
        if (!containerWidth || containerWidth < 1) return;

        const minW = BASE_CARD_WIDTH - MAX_CARD_WIDTH_DELTA;
        const maxW = BASE_CARD_WIDTH + MAX_CARD_WIDTH_DELTA;

        const preferredMinW = Math.max(minW, BASE_CARD_WIDTH - 20);

        const maxVisibleCount = Math.max(
            1,
            Math.floor((containerWidth + CARD_GAP_PX) / (minW + CARD_GAP_PX)),
        );
        const maxCount = Math.max(
            1,
            Math.min(maxVisibleCount, continueWatchingMeta.length || 1),
        );

        let bestWidth: number | null = null;
        let bestScore = Number.POSITIVE_INFINITY;

        for (let count = 1; count <= maxCount; count++) {
            const w = (containerWidth - CARD_GAP_PX * (count - 1)) / count;
            if (w < minW || w > maxW) continue;

            const penaltyTooSmall = w < preferredMinW ? (preferredMinW - w) * 3 : 0;
            const score = Math.abs(w - BASE_CARD_WIDTH) + penaltyTooSmall;

            if (score < bestScore) {
                bestScore = score;
                bestWidth = w;
            }
        }

        // Fallback: if no count produces an in-range width (rare), clamp.
        const finalW =
            bestWidth ?? Math.max(minW, Math.min(maxW, BASE_CARD_WIDTH));

        // Use sub-pixel precision to avoid visible right-side gaps.
        scrollContainer.style.setProperty(
            "--cw-card-w",
            `${finalW.toFixed(2)}px`,
        );
    }

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
        recomputeCardWidth();

        let ro: ResizeObserver | null = null;
        if (typeof ResizeObserver !== "undefined") {
            ro = new ResizeObserver(() => {
                updateScrollButtons();
                recomputeCardWidth();
            });
            if (scrollContainer) {
                ro.observe(scrollContainer);
            }
        }

        window.addEventListener("resize", updateScrollButtons);
        return () => {
            window.removeEventListener("resize", updateScrollButtons);
            ro?.disconnect();
        };
    });

    $: if (continueWatchingMeta.length) {
        // Re-run sizing when the number of items changes.
        recomputeCardWidth();
    }
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
    <div class="w-full h-fit flex flex-col gap-4 relative group overflow-visible">
        <div class="flex flex-row gap-[10px] items-center w-full">
            <Play size={50} strokeWidth={3} color="#E0E0E6" />

            <h1 class="font-poppins text-[#E0E0E6] font-medium text-[48px]">
                Jump back into it
            </h1>

            <button
                class="ml-auto p-2 rounded-full hover:bg-white/10 transition-colors duration-200 group/btn cursor-pointer"
                on:click={() => (isExpanded = !isExpanded)}
                aria-label={isExpanded ? "Collapse" : "Expand"}
            >
                <div class="transition-transform duration-300 {isExpanded ? 'rotate-180' : ''}">
                    <ChevronDown size={32} strokeWidth={2} color="#E0E0E6" />
                </div>
            </button>
        </div>

        <div class="relative">
            {#if showLeftButton && !isExpanded}
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
                class="flex gap-[20px] w-full pb-6 pt-3 transition-all duration-300 {isExpanded
                    ? 'flex-wrap'
                    : 'flex-row overflow-x-auto overflow-y-visible no-scrollbar scroll-smooth'}"
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
                            class="w-[var(--cw-card-w)] h-fit rounded-[16px] hover:opacity-90 transition-all duration-200 ease-out cursor-pointer overflow-clip relative flex-shrink-0 hover:-translate-y-1.5 hover:shadow-[0_14px_30px_rgba(0,0,0,0.35)]"

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

            {#if showRightButton && !isExpanded}
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
