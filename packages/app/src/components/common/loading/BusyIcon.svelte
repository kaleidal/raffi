<script lang="ts">
    import type { Snippet } from "svelte";
    import ShapeLoader, { APPEAR_DELAY_MS } from "./ShapeLoader.svelte";

    let { busy, size, children }: { busy: boolean; size: string; children: Snippet } = $props();
</script>

<span class="relative flex h-full w-full items-center justify-center" style:--appear-delay="{APPEAR_DELAY_MS}ms">
    <span class="flex h-full w-full items-center justify-center" class:handing-off={busy}>
        {@render children()}
    </span>
    {#if busy}
        <span class="absolute inset-0 flex items-center justify-center">
            <ShapeLoader {size} />
        </span>
    {/if}
</span>

<style>
    .handing-off {
        animation: hand-off 150ms ease var(--appear-delay) forwards;
    }

    @keyframes hand-off {
        to {
            opacity: 0;
            scale: 0.6;
        }
    }
</style>
