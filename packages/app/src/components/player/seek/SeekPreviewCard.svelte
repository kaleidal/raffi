<script lang="ts">
    import { fullscreenPortal } from "../../common/portal";
    import { formatTime } from "../../../lib/utils/time";

    export let anchorX = 0;
    export let anchorTop = 0;
    export let time = 0;
    export let chapterTitle: string | null = null;
    export let frame: ImageBitmap | null = null;
    export let withImage = false;

    const CARD_WIDTH = 208;
    const VIEWPORT_MARGIN = 12;
    const GAP_ABOVE_ANCHOR = 4;

    let canvas: HTMLCanvasElement | undefined;
    let innerWidth = 0;
    let innerHeight = 0;
    let aspectRatio = "16 / 9";

    $: if (canvas && frame) {
        canvas.width = frame.width;
        canvas.height = frame.height;
        canvas.getContext("2d")?.drawImage(frame, 0, 0);
        aspectRatio = `${frame.width} / ${frame.height}`;
    }

    $: left = withImage
        ? Math.min(
              Math.max(anchorX - CARD_WIDTH / 2, VIEWPORT_MARGIN),
              innerWidth - CARD_WIDTH - VIEWPORT_MARGIN,
          )
        : anchorX;
    $: bottom = innerHeight - anchorTop + GAP_ABOVE_ANCHOR;
</script>

<svelte:window bind:innerWidth bind:innerHeight />

<div
    use:fullscreenPortal
    class="fixed z-[1200] pointer-events-none flex flex-col overflow-hidden bg-[#000000]/60 backdrop-blur-md text-white shadow-[0_18px_50px_rgba(0,0,0,0.45)] {withImage
        ? 'rounded-[16px]'
        : 'rounded-md -translate-x-1/2'}"
    style={`left:${left}px;bottom:${bottom}px;${withImage ? `width:${CARD_WIDTH}px;` : ""}`}
>
    {#if withImage}
        <canvas
            bind:this={canvas}
            class="block w-full bg-white/6 {frame ? 'opacity-100 transition-opacity duration-150' : 'opacity-0'}"
            style={`aspect-ratio:${aspectRatio}`}
        ></canvas>
    {/if}
    <div
        class="tabular-nums text-[12px] whitespace-nowrap {withImage
            ? 'px-3 py-2 text-center truncate'
            : 'px-2 py-1'}"
    >
        {chapterTitle ? `${formatTime(time)} · ${chapterTitle}` : formatTime(time)}
    </div>
</div>
