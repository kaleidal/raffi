<script lang="ts">
    import type { SeekPreview } from "../../../lib/media/preview/seekPreview";
    import type { ClipView } from "./clipTimeline";

    let { preview, view }: { preview: SeekPreview | null; view: ClipView } = $props();

    const FRAME_ASPECT = 16 / 9;
    const SETTLE_MS = 120;

    let canvas = $state<HTMLCanvasElement>();
    let width = $state(0);
    let height = $state(0);

    function drawCover(context: CanvasRenderingContext2D, frame: ImageBitmap, x: number, slotWidth: number) {
        const slotHeight = context.canvas.height;
        const scale = Math.max(slotWidth / frame.width, slotHeight / frame.height);
        const cropWidth = slotWidth / scale;
        const cropHeight = slotHeight / scale;
        context.drawImage(
            frame,
            (frame.width - cropWidth) / 2,
            (frame.height - cropHeight) / 2,
            cropWidth,
            cropHeight,
            x,
            0,
            slotWidth,
            slotHeight,
        );
    }

    /** Fills the strip slot by slot, painting over the previous frames so zooming never blanks it. */
    $effect(() => {
        if (!canvas || !preview || !width || !height) return;
        const target = canvas;
        const source = preview;
        const { min, max } = view;
        let cancelled = false;

        const timer = setTimeout(async () => {
            const ratio = devicePixelRatio;
            const pixelWidth = Math.round(width * ratio);
            const pixelHeight = Math.round(height * ratio);
            if (target.width !== pixelWidth || target.height !== pixelHeight) {
                target.width = pixelWidth;
                target.height = pixelHeight;
            }
            const context = target.getContext("2d")!;
            const slotWidth = height * FRAME_ASPECT;
            const slots = Math.ceil(width / slotWidth);
            for (let slot = 0; slot < slots && !cancelled; slot++) {
                const time = min + (((slot + 0.5) * slotWidth) / width) * (max - min);
                const frame = source.peek(time) ?? (await source.frameAt(time));
                if (cancelled) return;
                if (frame?.width) drawCover(context, frame, slot * slotWidth * ratio, slotWidth * ratio);
            }
        }, SETTLE_MS);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    });
</script>

<div class="absolute inset-0 overflow-hidden rounded-[inherit] bg-ink/8" bind:clientWidth={width} bind:clientHeight={height}>
    {#if preview}
        <canvas bind:this={canvas} class="h-full w-full"></canvas>
    {/if}
</div>
