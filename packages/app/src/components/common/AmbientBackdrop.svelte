<script lang="ts">
    import { fade } from "svelte/transition";

    let { src }: { src: string | null | undefined } = $props();
</script>

<div class="ambient pointer-events-none absolute inset-x-0 top-0 overflow-hidden" aria-hidden="true">
    {#key src}
        {#if src}
            <img {src} alt="" class="ambient-image" decoding="async" transition:fade={{ duration: 700 }} />
        {/if}
    {/key}
    <div class="absolute inset-0 bg-gradient-to-b from-canvas/20 via-canvas/70 to-canvas"></div>
</div>

<style>
    .ambient {
        height: min(100dvh, 1100px);
    }

    .ambient-image {
        position: absolute;
        inset: -12%;
        width: 124%;
        height: 124%;
        max-width: none;
        object-fit: cover;
        filter: blur(80px) saturate(1.6);
        opacity: 0.55;
    }

    :global(:root[data-theme="light"]) .ambient-image {
        opacity: 0.35;
    }
</style>
