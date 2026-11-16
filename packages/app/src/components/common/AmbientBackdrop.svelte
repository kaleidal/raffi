<script lang="ts">
    import { untrack } from "svelte";

    let { src, fill = false }: { src: string | null | undefined; fill?: boolean } = $props();

    const SAMPLE_WIDTH = 64;
    const SAMPLE_HEIGHT = 36;

    type Layer = { id: number; src: string; visible: boolean };

    let layers = $state<Layer[]>([]);
    let nextId = 0;
    let latest = -1;

    function reveal(id: number) {
        if (id !== latest) {
            drop(id);
            return;
        }
        layers = layers.map((layer) => (layer.id === id ? { ...layer, visible: true } : layer));
    }

    function drop(id: number) {
        layers = layers.filter((layer) => layer.id !== id);
    }

    function settle(id: number) {
        const layer = layers.find((entry) => entry.id === id);
        if (!layer) return;
        layers = layer.visible ? layers.filter((entry) => entry.id >= id) : layers.filter((entry) => entry.id !== id);
    }

    function paint(canvas: HTMLCanvasElement, layer: Layer) {
        const image = new Image();
        image.decoding = "async";
        image.src = layer.src;
        image
            .decode()
            .then(() => {
                const context = canvas.getContext("2d");
                if (!context) return;
                context.fillStyle = getComputedStyle(canvas).getPropertyValue("--raffi-canvas");
                context.fillRect(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
                context.filter = "blur(2px) saturate(1.6)";
                context.drawImage(image, -4, -4, SAMPLE_WIDTH + 8, SAMPLE_HEIGHT + 8);
                reveal(layer.id);
            })
            .catch(() => drop(layer.id));
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
            }
        });
    });
</script>

<div class="ambient pointer-events-none inset-x-0 top-0 overflow-hidden" class:fill aria-hidden="true">
    <div class="ambient-layers absolute inset-0">
        {#each layers as layer (layer.id)}
            <canvas
                use:paint={layer}
                width={SAMPLE_WIDTH}
                height={SAMPLE_HEIGHT}
                class="ambient-layer"
                class:visible={layer.visible}
                ontransitionend={() => settle(layer.id)}
            ></canvas>
        {/each}
    </div>
    <div class="ambient-shade absolute inset-0"></div>
</div>

<style>
    .ambient {
        position: absolute;
        height: min(100dvh, 1100px);
    }

    .ambient.fill {
        position: fixed;
        height: 100dvh;
    }

    .ambient-shade {
        background: linear-gradient(
            to bottom,
            color-mix(in oklab, var(--raffi-canvas) 20%, transparent),
            color-mix(in oklab, var(--raffi-canvas) 70%, transparent) 50%,
            var(--raffi-canvas)
        );
    }

    .fill .ambient-shade {
        background: linear-gradient(
            to bottom,
            var(--raffi-canvas),
            color-mix(in oklab, var(--raffi-canvas) 55%, transparent) 40%,
            color-mix(in oklab, var(--raffi-canvas) 40%, transparent)
        );
    }

    .ambient-layer {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        opacity: 0;
        transition: opacity 900ms ease;
        will-change: opacity;
    }

    .ambient-layer.visible {
        opacity: 1;
    }

    .ambient-layers {
        opacity: 0.55;
    }

    :global(:root[data-theme="light"]) .ambient-layers {
        opacity: 0.35;
    }
</style>
