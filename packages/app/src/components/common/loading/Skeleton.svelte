<script lang="ts">
    let {
        width = "100%",
        height = "20px",
        borderRadius = "8px",
    }: { width?: string; height?: string; borderRadius?: string } = $props();
</script>

<div
    class="skeleton"
    style="--width: {width}; --height: {height}; --border-radius: {borderRadius}"
></div>

<style>
    .skeleton {
        width: var(--width);
        height: var(--height);
        border-radius: var(--border-radius);
        background: linear-gradient(
            90deg,
            color-mix(in oklab, var(--raffi-ink) 5%, transparent) 25%,
            color-mix(in oklab, var(--raffi-ink) 10%, transparent) 50%,
            color-mix(in oklab, var(--raffi-ink) 5%, transparent) 75%
        );
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite;
    }

    @keyframes shimmer {
        0% {
            background-position: 200% 0;
        }
        100% {
            background-position: -200% 0;
        }
    }
</style>
