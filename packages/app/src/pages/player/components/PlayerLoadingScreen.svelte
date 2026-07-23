<script lang="ts">
    import { fade } from "svelte/transition";
    import type { ShowResponse } from "../../../lib/library/types/meta_types";
    import { ChevronLeft } from "@lucide/svelte";
    import { overlayZoomStyle } from "../../../lib/overlayZoom";
    import LoadingSpinner from "../../../components/common/LoadingSpinner.svelte";

    const portal = (node: HTMLElement) => {
        if (typeof document === "undefined") {
            return { destroy() {} };
        }
        const target = document.fullscreenElement || document.body;
        target.appendChild(node);
        return {
            destroy() {
                if (node.parentNode) {
                    node.parentNode.removeChild(node);
                }
            },
        };
    };

    export let loading: boolean;
    export let onClose: () => void;
    export let metaData: ShowResponse | null;

    export let stage: string = "Loading...";
    export let details: string = "";
    export let progress: number | null = null;
    export let backdropSrc: string | null = null;
    export let backdropMode: "art" | "frame" = "art";

    const MOSAIC_COLS = 8;
    const MOSAIC_ROWS = 5;
    const MOSAIC_TILE_COUNT = MOSAIC_COLS * MOSAIC_ROWS;

    const mosaicTiles = Array.from({ length: MOSAIC_TILE_COUNT }, (_, index) => {
        const col = index % MOSAIC_COLS;
        const row = Math.floor(index / MOSAIC_COLS);
        return {
            index,
            bgPosX: MOSAIC_COLS > 1 ? (col / (MOSAIC_COLS - 1)) * 100 : 0,
            bgPosY: MOSAIC_ROWS > 1 ? (row / (MOSAIC_ROWS - 1)) * 100 : 0,
            wave: (row + col) / (MOSAIC_COLS + MOSAIC_ROWS - 2),
        };
    });

    $: effectiveBackdropSrc = backdropSrc ?? metaData?.meta?.background ?? metaData?.meta?.poster ?? "";
    $: revealFraction = progress === null ? null : Math.max(0, Math.min(1, progress));
    $: revealCount = revealFraction === null ? 0 : Math.round(revealFraction * MOSAIC_TILE_COUNT);
    $: void backdropMode;
</script>

{#if loading}
    <div
        use:portal
        class="fixed inset-0 z-50 overflow-hidden bg-[#090909]"
        style={overlayZoomStyle}
        role="status"
        aria-busy="true"
        aria-label={stage || "Loading video"}
        transition:fade={{ duration: 280 }}
    >
        <div
            class="mosaic-grid"
            style={`--mosaic-cols:${MOSAIC_COLS}; --mosaic-rows:${MOSAIC_ROWS};`}
        >
            {#each mosaicTiles as tile (tile.index)}
                {@const settled = revealFraction !== null && tile.index < revealCount}
                <div class="mosaic-tile">
                    <div
                        class="mosaic-tile-inner"
                        class:mosaic-tile-inner--spinning={!settled}
                        style={`--tile-delay:${(tile.wave * 1.4).toFixed(2)}s;${settled ? " transform: rotateY(0deg);" : ""}`}
                    >
                        <div
                            class="mosaic-face mosaic-face-front"
                            style={effectiveBackdropSrc
                                ? `background-image:url('${effectiveBackdropSrc}'); background-size:${MOSAIC_COLS * 100}% ${MOSAIC_ROWS * 100}%; background-position:${tile.bgPosX}% ${tile.bgPosY}%;`
                                : ""}
                        ></div>
                        <div class="mosaic-face mosaic-face-back"></div>
                    </div>
                </div>
            {/each}
        </div>

        <div
            class="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#090909]"
        ></div>

        <div class="absolute bottom-0 right-0 z-10 p-8 sm:p-10">
            <LoadingSpinner size="44px" />
        </div>

        {#if details}
            <span class="sr-only">{details}</span>
        {/if}

        <div class="absolute left-0 top-0 p-10 z-50">
            <button
                class="bg-[#000000]/28 backdrop-blur-md hover:bg-[#FFFFFF]/20 transition-colors duration-200 rounded-full p-4 cursor-pointer"
                on:click={onClose}
                aria-label="Close player"
            >
                <ChevronLeft size={30} color="white" strokeWidth={2} />
            </button>
        </div>
    </div>
{/if}

<style>
    .mosaic-grid {
        position: absolute;
        inset: 0;
        display: grid;
        grid-template-columns: repeat(var(--mosaic-cols), 1fr);
        grid-template-rows: repeat(var(--mosaic-rows), 1fr);
        gap: 2px;
        perspective: 1400px;
        opacity: 0.6;
    }

    .mosaic-tile {
        position: relative;
        overflow: hidden;
    }

    .mosaic-tile-inner {
        position: absolute;
        inset: 0;
        transform-style: preserve-3d;
        transition: transform 0.7s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .mosaic-tile-inner--spinning {
        animation: mosaic-flip 3.4s ease-in-out infinite;
        animation-delay: var(--tile-delay);
    }

    .mosaic-face {
        position: absolute;
        inset: 0;
        backface-visibility: hidden;
        background-color: #1a1a1a;
        background-repeat: no-repeat;
    }

    .mosaic-face-back {
        transform: rotateY(180deg);
        background-color: #090909;
    }

    @keyframes mosaic-flip {
        0%,
        100% {
            transform: rotateY(0deg);
        }
        50% {
            transform: rotateY(180deg);
        }
    }
</style>
