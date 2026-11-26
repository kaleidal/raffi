<script lang="ts">
    import { fullscreenPortal } from "../../common/portal";
    import { formatTime } from "../../../lib/utils/time";
    import ShapeLoader from "../../common/loading/ShapeLoader.svelte";

    let {
        anchorX = 0,
        anchorTop = 0,
        time = 0,
        chapterTitle = null,
        frame = null,
        withImage = false,
    }: {
        anchorX?: number;
        anchorTop?: number;
        time?: number;
        chapterTitle?: string | null;
        frame?: ImageBitmap | null;
        withImage?: boolean;
    } = $props();

    const CARD_WIDTH = 208;
    const VIEWPORT_MARGIN = 12;
    const GAP_ABOVE_ANCHOR = 4;

    let canvas = $state<HTMLCanvasElement>();
    let innerWidth = $state(0);
    let innerHeight = $state(0);

    let aspectRatio = $state("16 / 9");
    const drawable = $derived(frame && frame.width > 0 ? frame : null);

    $effect(() => {
        if (!canvas || !drawable) return;
        canvas.width = drawable.width;
        canvas.height = drawable.height;
        canvas.getContext("2d")?.drawImage(drawable, 0, 0);
        aspectRatio = `${drawable.width} / ${drawable.height}`;
    });

    const left = $derived(
        withImage
            ? Math.min(Math.max(anchorX - CARD_WIDTH / 2, VIEWPORT_MARGIN), innerWidth - CARD_WIDTH - VIEWPORT_MARGIN)
            : anchorX,
    );
    const bottom = $derived(innerHeight - anchorTop + GAP_ABOVE_ANCHOR);
</script>

<svelte:window bind:innerWidth bind:innerHeight />

<div
    use:fullscreenPortal
    class="fixed z-[1200] pointer-events-none flex flex-col overflow-hidden bg-black/60 backdrop-blur-md text-ink shadow-[0_18px_50px_rgba(0,0,0,0.45)] {withImage
        ? 'rounded-[16px]'
        : 'rounded-md -translate-x-1/2'}"
    style={`left:${left}px;bottom:${bottom}px;${withImage ? `width:${CARD_WIDTH}px;` : ""}`}
>
    {#if withImage}
        <div class="relative w-full bg-ink/6" style:aspect-ratio={aspectRatio}>
            <canvas
                bind:this={canvas}
                class="block h-full w-full {drawable ? 'opacity-100 transition-opacity duration-150' : 'opacity-0'}"
            ></canvas>
            {#if !drawable}
                <div class="absolute inset-0 flex items-center justify-center text-ink/70">
                    <ShapeLoader size="28px" />
                </div>
            {/if}
        </div>
    {/if}
    <div
        class="tabular-nums text-[12px] whitespace-nowrap {withImage
            ? 'px-3 py-2 text-center truncate'
            : 'px-2 py-1'}"
    >
        {chapterTitle ? `${formatTime(time)} · ${chapterTitle}` : formatTime(time)}
    </div>
</div>
