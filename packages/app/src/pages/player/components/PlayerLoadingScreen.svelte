<script lang="ts">
    import { fade } from "svelte/transition";
    import type { ShowResponse } from "../../../lib/library/types/meta_types";
    import { ChevronLeft, MonitorDown } from "@lucide/svelte";
    import { isDesktopPlatform } from "../../../lib/platform";
    import LoadingSpinner from "../../../components/common/LoadingSpinner.svelte";
    import { onDestroy } from "svelte";

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
    export let showError: boolean = false;
    export let errorMessage: string = "";
    export let errorDetails: string = "";
    export let onRetry: () => void = () => {};
    export let onBack: () => void = () => {};
    export let onDownloadDesktop: () => void = () => {};
    export let showSeekStyle: boolean = false;
    export let seekBarStyle: "raffi" | "normal" = "raffi";
    export let onSeekStyleChange: (detail: { style: "raffi" | "normal" }) => void = () => {};
    export let onSeekStyleAcknowledge: () => void = () => {};

    let tileElements: Array<HTMLElement | undefined> = [];
    let errorContentVisible = false;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let settleFrame: number | null = null;
    let lastBlockingState = "";
    let blockingState = "";
    let localSeekBarStyle: "raffi" | "normal" = seekBarStyle;

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

    function registerTile(node: HTMLElement, index: number) {
        tileElements[index] = node;
        return {
            destroy() {
                if (tileElements[index] === node) tileElements[index] = undefined;
            },
        };
    }

    function clearSettleWork() {
        if (settleTimer) clearTimeout(settleTimer);
        if (settleFrame !== null && typeof cancelAnimationFrame !== "undefined") {
            cancelAnimationFrame(settleFrame);
        }
        settleTimer = null;
        settleFrame = null;
    }

    function settleTilesForBlockingState() {
        clearSettleWork();
        errorContentVisible = false;

        if (typeof window === "undefined") {
            errorContentVisible = true;
            return;
        }

        for (const tile of tileElements) {
            if (!tile) continue;
            const currentTransform = getComputedStyle(tile).transform;
            tile.style.animation = "none";
            tile.style.transform = currentTransform === "none" ? "rotateY(0deg)" : currentTransform;
        }

        // Preserve the exact in-flight rotation, then ease every tile onto its front face.
        settleFrame = requestAnimationFrame(() => {
            for (const tile of tileElements) {
                if (!tile) continue;
                tile.style.transform = "rotateY(0deg)";
            }
            settleFrame = null;
        });

        settleTimer = setTimeout(() => {
            errorContentVisible = true;
            settleTimer = null;
        }, 760);
    }

    function resetTilesAfterError() {
        clearSettleWork();
        errorContentVisible = false;
        for (const tile of tileElements) {
            if (!tile) continue;
            tile.style.animation = "";
            tile.style.transform = "";
        }
    }

    $: blockingState = showError ? "error" : showSeekStyle ? "seek-style" : "";
    $: if (blockingState !== lastBlockingState) {
        lastBlockingState = blockingState;
        if (blockingState) settleTilesForBlockingState();
        else resetTilesAfterError();
    }
    $: if (seekBarStyle !== localSeekBarStyle) localSeekBarStyle = seekBarStyle;

    function toggleSeekStyle() {
        localSeekBarStyle = localSeekBarStyle === "raffi" ? "normal" : "raffi";
        onSeekStyleChange({ style: localSeekBarStyle });
    }

    onDestroy(clearSettleWork);
</script>

{#if loading || blockingState}
    <div
        use:portal
        class="fixed inset-0 z-[200] overflow-hidden bg-[#090909]"
        role={showError ? "alert" : showSeekStyle ? "dialog" : "status"}
        aria-busy={!blockingState}
        aria-label={showError
            ? errorMessage || "Playback error"
            : showSeekStyle
              ? "Choose seek bar style"
              : stage || "Loading video"}
        transition:fade={{ duration: 280 }}
    >
        <div
            class="mosaic-grid"
            class:mosaic-grid--blocked={Boolean(blockingState)}
            style={`--mosaic-cols:${MOSAIC_COLS}; --mosaic-rows:${MOSAIC_ROWS};`}
        >
            {#each mosaicTiles as tile (tile.index)}
                {@const settled = revealFraction !== null && tile.index < revealCount}
                <div class="mosaic-tile">
                    <div
                        use:registerTile={tile.index}
                        class="mosaic-tile-inner"
                        class:mosaic-tile-inner--spinning={!settled && !blockingState}
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

        <div class="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-[#090909]"></div>

        {#if !blockingState}
            <div class="absolute bottom-0 right-0 z-10 p-8 sm:p-10">
                <LoadingSpinner size="44px" />
            </div>
        {/if}

        {#if showError && errorContentVisible}
            <div class="error-state absolute inset-0 z-20 flex items-center justify-center px-6 py-24">
                <div class="flex w-full max-w-lg flex-col items-center text-center">
                    <h1 class="text-balance text-3xl font-semibold tracking-[-0.025em] text-white sm:text-4xl">
                        {errorMessage || "Playback stopped"}
                    </h1>
                    {#if errorDetails}
                        <p class="mt-4 max-w-md text-pretty text-[15px] leading-6 text-white/62 sm:text-base">
                            {errorDetails}
                        </p>
                    {/if}

                    <div class="mt-8 flex w-full max-w-sm flex-col gap-3 sm:flex-row sm:justify-center">
                        <button
                            class="cursor-pointer rounded-xl bg-white px-5 py-3 text-[15px] font-semibold text-black transition-colors hover:bg-white/88 sm:min-w-32"
                            on:click={onRetry}
                        >
                            Try Again
                        </button>
                        <button
                            class="cursor-pointer rounded-xl bg-white/10 px-5 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-white/16 sm:min-w-36"
                            on:click={onBack}
                        >
                            Back to Streams
                        </button>
                    </div>

                    {#if !isDesktopPlatform}
                        <button
                            class="mt-4 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white/58 transition-colors hover:text-white"
                            on:click={onDownloadDesktop}
                        >
                            <MonitorDown size={17} strokeWidth={2} />
                            Download Desktop App
                        </button>
                    {/if}
                </div>
            </div>
        {:else if showSeekStyle && errorContentVisible}
            <div class="error-state absolute inset-0 z-20 flex items-center justify-center px-6 py-24">
                <div class="flex w-full max-w-lg flex-col items-center text-center">
                    <h1 class="text-balance text-3xl font-semibold tracking-[-0.025em] text-white sm:text-4xl">
                        Choose how seeking feels
                    </h1>
                    <p class="mt-4 max-w-md text-pretty text-[15px] leading-6 text-white/62 sm:text-base">
                        Raffi’s seek bar is inverted: move left to go forward and right to go back. You can switch to the normal direction instead.
                    </p>

                    <div class="mt-8 w-full max-w-sm">
                        <div class="mb-2 text-left text-xs font-medium uppercase tracking-[0.14em] text-white/42">
                            Seek direction
                        </div>
                        <button
                            class="relative h-11 w-full cursor-pointer rounded-full border border-white/10 bg-white/8 p-1 transition-colors hover:bg-white/12"
                            on:click={toggleSeekStyle}
                            aria-label="Toggle seek bar style"
                            type="button"
                        >
                            <div class="relative z-10 flex h-full w-full items-center">
                                <span class={`flex-1 text-center text-xs font-semibold tracking-wider transition-colors ${localSeekBarStyle === "raffi" ? "text-black" : "text-white/55"}`}>RAFFI</span>
                                <span class={`flex-1 text-center text-xs font-semibold tracking-wider transition-colors ${localSeekBarStyle === "normal" ? "text-black" : "text-white/55"}`}>NORMAL</span>
                            </div>
                            <div class={`absolute bottom-1 left-1 top-1 w-[calc(50%-4px)] rounded-full bg-white transition-transform duration-200 ${localSeekBarStyle === "normal" ? "translate-x-full" : "translate-x-0"}`}></div>
                        </button>
                        <button
                            class="mt-3 w-full cursor-pointer rounded-xl bg-white px-5 py-3 text-[15px] font-semibold text-black transition-colors hover:bg-white/88"
                            on:click={onSeekStyleAcknowledge}
                            type="button"
                        >
                            Continue
                        </button>
                    </div>
                </div>
            </div>
        {/if}

        {#if details}
            <span class="sr-only">{details}</span>
        {/if}

        <div class="absolute left-0 top-0 p-4 sm:p-10 z-50">
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
        filter: grayscale(0);
        transition: opacity 0.7s ease, filter 0.7s ease;
    }

    .mosaic-grid--blocked {
        opacity: 0.2;
        filter: grayscale(1) brightness(0.62);
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

    .error-state {
        animation: error-content-in 0.38s ease-out both;
    }

    @keyframes error-content-in {
        from {
            opacity: 0;
            transform: translateY(8px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .mosaic-tile-inner--spinning {
            animation: none;
        }

        .mosaic-tile-inner,
        .mosaic-grid {
            transition-duration: 0.01ms;
        }

        .error-state {
            animation-duration: 0.01ms;
        }
    }
</style>
