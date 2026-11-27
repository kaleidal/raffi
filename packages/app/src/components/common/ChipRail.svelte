<script lang="ts">
    import type { Snippet } from "svelte";
    import { ChevronLeft, ChevronRight } from "@lucide/svelte";

    let { children }: { children: Snippet } = $props();

    let rail = $state<HTMLDivElement | null>(null);
    let canScrollBack = $state(false);
    let canScrollOn = $state(false);

    function measure() {
        if (!rail) return;
        canScrollBack = rail.scrollLeft > 1;
        canScrollOn = rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 1;
    }

    function page(direction: 1 | -1) {
        rail?.scrollBy({ left: direction * rail.clientWidth * 0.7, behavior: "smooth" });
    }

    $effect(() => {
        if (!rail) return;
        const resizes = new ResizeObserver(measure);
        const changes = new MutationObserver(measure);
        resizes.observe(rail);
        changes.observe(rail, { childList: true });
        return () => {
            resizes.disconnect();
            changes.disconnect();
        };
    });
</script>

<div class="relative flex items-center gap-2">
    {#if canScrollBack}
        <button class="rail-arrow" aria-label="Scroll back" onclick={() => page(-1)}>
            <ChevronLeft size={18} strokeWidth={2.2} />
        </button>
    {/if}
    <div
        bind:this={rail}
        class="chip-rail no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto scroll-smooth"
        class:fade-start={canScrollBack}
        class:fade-end={canScrollOn}
        onscroll={measure}
    >
        {@render children()}
    </div>
    {#if canScrollOn}
        <button class="rail-arrow" aria-label="Scroll on" onclick={() => page(1)}>
            <ChevronRight size={18} strokeWidth={2.2} />
        </button>
    {/if}
</div>

<style>
    .rail-arrow {
        display: flex;
        flex-shrink: 0;
        width: 40px;
        height: 40px;
        align-items: center;
        justify-content: center;
        border-radius: 9999px;
        cursor: pointer;
        color: var(--raffi-ink);
        background: color-mix(in oklab, var(--raffi-ink) 8%, transparent);
        transition: background-color 200ms;
    }

    .rail-arrow:hover {
        background: color-mix(in oklab, var(--raffi-ink) 14%, transparent);
    }

    .chip-rail {
        --fade-start: 0px;
        --fade-end: 0px;
        mask-image: linear-gradient(
            to right,
            transparent,
            black var(--fade-start),
            black calc(100% - var(--fade-end)),
            transparent
        );
    }

    .chip-rail.fade-start {
        --fade-start: 48px;
    }

    .chip-rail.fade-end {
        --fade-end: 48px;
    }
</style>
