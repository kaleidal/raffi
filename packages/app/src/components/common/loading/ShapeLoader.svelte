<script lang="ts" module>
    /** Quick waits finish before the loader shows, so they don't flash it. */
    export const APPEAR_DELAY_MS = 300;
</script>

<script lang="ts">
    import { SHAPE_PATHS, TURN_PER_SHAPE } from "./morphShapes";

    let { size = "44px", class: className = "" }: { size?: string; class?: string } = $props();

    const STEP_MS = 700;
    const EASING = "cubic-bezier(0.42, 0, 0.18, 1.25)";

    const loop = <T,>(frames: T[]) => [...frames, frames[0]];

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function morph(path: SVGPathElement) {
        if (still) return;
        const animation = path.animate(
            loop(SHAPE_PATHS).map((d) => ({ d: `path("${d}")`, easing: EASING })),
            { duration: STEP_MS * SHAPE_PATHS.length, iterations: Infinity },
        );
        return { destroy: () => animation.cancel() };
    }

    function spin(group: SVGGElement) {
        if (still) return;
        const animation = group.animate(
            [...SHAPE_PATHS.map((_, step) => ({ rotate: `${step * TURN_PER_SHAPE}deg`, easing: EASING })), { rotate: "720deg" }],
            { duration: STEP_MS * SHAPE_PATHS.length, iterations: Infinity },
        );
        return { destroy: () => animation.cancel() };
    }
</script>

<svg viewBox="0 0 100 100" style:width={size} style:height={size} style:--appear-delay="{APPEAR_DELAY_MS}ms" class="shape-loader shrink-0 {className}" aria-hidden="true">
    <g use:spin class="origin-center [transform-box:view-box]">
        <path use:morph d={SHAPE_PATHS[0]} fill="currentColor" />
    </g>
</svg>

<style>
    .shape-loader {
        opacity: 0;
        animation: appear 200ms ease var(--appear-delay) forwards;
    }

    @keyframes appear {
        to {
            opacity: 1;
        }
    }
</style>
