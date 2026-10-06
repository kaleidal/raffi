<script lang="ts">
    import { pointerScrub, type ScrubPosition } from "./pointerScrub";

    export let value: number;
    export let label = "";
    export let min = 0;
    export let max = 1;
    export let onInput: (value: number) => void;

    let hovering = false;
    let dragging = false;

    $: fraction = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
    $: active = hovering || dragging;

    const valueAt = ({ ratio }: ScrubPosition) => onInput(min + ratio * (max - min));
</script>

<div class="flex flex-col items-stretch gap-1 w-full min-w-0">
    {#if label}
        <span class="text-[#878787] text-[0.9375rem] font-poppins font-medium">{label}</span>
    {/if}
    <div
        class="relative h-4 w-full cursor-pointer touch-none select-none"
        role="slider"
        tabindex="-1"
        aria-label={label || undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        use:pointerScrub={{
            onHover: () => (hovering = true),
            onLeave: () => (hovering = false),
            onStart: (position) => {
                dragging = true;
                valueAt(position);
            },
            onMove: valueAt,
            onEnd: () => (dragging = false),
        }}
    >
        <div
            class="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 overflow-hidden rounded-full bg-[#A3A3A3]/30 transition-[height] duration-150 ease-out {active
                ? 'h-2'
                : 'h-1'}"
        >
            <div
                class="absolute inset-0 origin-left bg-white {dragging ? '' : 'transition-transform duration-150'}"
                style={`transform:scaleX(${fraction})`}
            ></div>
        </div>
        <div
            class="pointer-events-none absolute top-1/2 size-3.5 rounded-full bg-white shadow-[0_1px_6px_rgba(0,0,0,0.35)] {active
                ? 'scale-100'
                : 'scale-0'}"
            style={`left:${fraction * 100}%;translate:-50% -50%;transition:scale 150ms ease-out`}
        ></div>
    </div>
</div>
