<script lang="ts">
    import { untrack } from "svelte";

    let { src }: { src: string | null | undefined } = $props();

    const FADE_MS = 900;

    type Layer = { id: number; src: string; visible: boolean };

    let layers = $state<Layer[]>([]);
    let nextId = 0;
    let latest = -1;

    function dropHiddenAfterFade() {
        setTimeout(() => {
            layers = layers.filter((layer) => layer.visible || layer.id === latest);
        }, FADE_MS);
    }

    function reveal(id: number) {
        if (id !== latest) {
            drop(id);
            return;
        }
        layers = layers.map((layer) => ({ ...layer, visible: layer.id === id }));
        dropHiddenAfterFade();
    }

    function drop(id: number) {
        layers = layers.filter((layer) => layer.id !== id);
    }

    $effect(() => {
        const next = src;
        untrack(() => {
            if (next) {
                latest = nextId++;
                layers = [...layers, { id: latest, src: next, visible: false }];
            } else {
                latest = -1;
                layers = layers.map((layer) => ({ ...layer, visible: false }));
                dropHiddenAfterFade();
            }
        });
    });
</script>

<div class="ambient pointer-events-none absolute inset-x-0 top-0 overflow-hidden" aria-hidden="true">
    {#each layers as layer (layer.id)}
        <img
            src={layer.src}
            alt=""
            class="ambient-image"
            class:visible={layer.visible}
            decoding="async"
            onload={() => reveal(layer.id)}
            onerror={() => drop(layer.id)}
        />
    {/each}
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
        opacity: 0;
        transition: opacity 900ms ease;
    }

    .ambient-image.visible {
        opacity: 0.55;
    }

    :global(:root[data-theme="light"]) .ambient-image.visible {
        opacity: 0.35;
    }

    @media (prefers-reduced-motion: reduce) {
        .ambient-image {
            transition: none;
        }
    }
</style>
