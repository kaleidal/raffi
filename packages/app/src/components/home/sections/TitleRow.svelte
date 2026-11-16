<script lang="ts">
    import type { PopularTitleMeta } from "../../../lib/library/types/popular_types";
    import { fade } from "svelte/transition";
    import { onDestroy, onMount, tick } from "svelte";
    import { ChevronLeft, ChevronRight } from "@lucide/svelte";
    import PosterCard from "./PosterCard.svelte";

    export let title: string;
    export let titles: PopularTitleMeta[];
    export let onSeeAll: (() => void) | null = null;

    let scrollContainer: HTMLDivElement;
    let showLeftButton = false;
    let showRightButton = false;
    let visibleCount = 24;
    let previousTitles = titles;
    let scrollFrame: number | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const BATCH_SIZE = 24;
    const LOAD_AHEAD_PX = 1200;

    $: renderedTitles = titles.slice(0, visibleCount);
    $: if (titles !== previousTitles) {
        previousTitles = titles;
        visibleCount = Math.min(BATCH_SIZE, titles.length);
        scheduleScrollCheck();
    }

    function checkScroll() {
        if (!scrollContainer) return;
        showLeftButton = scrollContainer.scrollLeft > 0;
        showRightButton =
            visibleCount < titles.length ||
            scrollContainer.scrollLeft + scrollContainer.clientWidth <
            scrollContainer.scrollWidth - 10;

        const remaining =
            scrollContainer.scrollWidth -
            scrollContainer.scrollLeft -
            scrollContainer.clientWidth;
        if (remaining < LOAD_AHEAD_PX) revealMore();
    }

    function scheduleScrollCheck() {
        if (typeof requestAnimationFrame === "undefined" || scrollFrame !== null) return;
        scrollFrame = requestAnimationFrame(() => {
            scrollFrame = null;
            checkScroll();
        });
    }

    function revealMore() {
        if (visibleCount >= titles.length) return;
        visibleCount = Math.min(visibleCount + BATCH_SIZE, titles.length);
        void tick().then(scheduleScrollCheck);
    }

    function scrollLeft() {
        scrollContainer.scrollBy({ left: -800, behavior: "smooth" });
    }

    async function scrollRight() {
        if (
            visibleCount < titles.length &&
            scrollContainer.scrollLeft + scrollContainer.clientWidth + 900 >=
                scrollContainer.scrollWidth
        ) {
            revealMore();
            await tick();
        }
        scrollContainer.scrollBy({ left: 800, behavior: "smooth" });
    }


    onMount(() => {
        if (!scrollContainer) return;
        resizeObserver = new ResizeObserver(scheduleScrollCheck);
        resizeObserver.observe(scrollContainer);
        scheduleScrollCheck();
    });

    onDestroy(() => {
        resizeObserver?.disconnect();
        if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
    });
</script>

<div class="home-section w-full h-fit flex flex-col gap-4 relative group overflow-visible">
    <div class="flex items-center justify-between gap-4">
        <h2 class="section-title text-ink text-[clamp(28px,2.2vw,44px)] font-semibold">
            {title}
        </h2>
        {#if onSeeAll}
            <button
                class="cursor-pointer rounded-full px-4 py-2 font-medium text-ink/60 transition-colors hover:bg-ink/8 hover:text-ink"
                on:click={onSeeAll}
            >
                See all
            </button>
        {/if}
    </div>

    <div class="relative">
        {#if showLeftButton}
            <button
                class="rail-button absolute inset-y-3 left-0 z-20 flex items-center justify-center rounded-r-2xl bg-gradient-to-r from-canvas/90 to-canvas/35 text-ink backdrop-blur-sm transition-opacity duration-200 cursor-pointer"
                on:click={scrollLeft}
                aria-label="Scroll left"
                transition:fade={{ duration: 200 }}
            >
                <ChevronLeft size={24} strokeWidth={2} />
            </button>
        {/if}

    <div
        bind:this={scrollContainer}
        on:scroll={scheduleScrollCheck}
        data-scroll-row
        class="flex flex-row gap-[20px] overflow-x-scroll overflow-y-visible pt-3 pb-6 no-scrollbar scroll-smooth"
    >
            {#each renderedTitles as entry (`${entry.type}:${entry.imdb_id}`)}
                <PosterCard title={entry} class="w-[clamp(150px,13vw,200px)]" />
            {/each}
        </div>

        {#if showRightButton}
            <button
                class="rail-button absolute inset-y-3 right-0 z-20 flex items-center justify-center rounded-l-2xl bg-gradient-to-l from-canvas/90 to-canvas/35 text-ink backdrop-blur-sm transition-opacity duration-200 cursor-pointer"
                on:click={scrollRight}
                aria-label="Scroll right"
                transition:fade={{ duration: 200 }}
            >
                <ChevronRight size={24} strokeWidth={2} />
            </button>
        {/if}
    </div>
</div>

<style>
    .home-section {
        content-visibility: auto;
        contain-intrinsic-size: auto 390px;
    }
    .section-title {
        transition: font-size 300ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .rail-button {
        width: clamp(42px, 3vw, 56px);
    }
</style>
