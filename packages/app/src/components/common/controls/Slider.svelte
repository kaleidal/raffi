<script lang="ts">
    import { pointerScrub, type ScrubPosition } from "./pointerScrub";

    let {
        value,
        label,
        min = 0,
        max = 1,
        onInput,
    }: { value: number; label: string; min?: number; max?: number; onInput: (value: number) => void } = $props();

    let hovering = $state(false);
    let dragging = $state(false);

    const fraction = $derived(max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0);
    const active = $derived(hovering || dragging);

    const valueAt = ({ ratio }: ScrubPosition) => onInput(min + ratio * (max - min));
</script>

<div class="w-full min-w-0">
    <div
        class="relative h-4 w-full cursor-pointer touch-none select-none"
        role="slider"
        tabindex="-1"
        aria-label={label}
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
            class="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 overflow-hidden rounded-full bg-ink/20 transition-[height] duration-150 ease-out {active
                ? 'h-2'
                : 'h-1'}"
        >
            <div
                class="absolute inset-0 origin-left bg-accent {dragging ? '' : 'transition-transform duration-150'}"
                style={`transform:scaleX(${fraction})`}
            ></div>
        </div>
        <div
            class="pointer-events-none absolute top-1/2 size-3.5 rounded-full bg-accent shadow-[0_1px_6px_rgba(0,0,0,0.35)] {active
                ? 'scale-100'
                : 'scale-0'}"
            style={`left:${fraction * 100}%;translate:-50% -50%;transition:scale 150ms ease-out`}
        ></div>
    </div>
</div>
