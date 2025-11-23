<script lang="ts">
    export let width = "100%";
    export let height = "20px";
    export let borderRadius = "8px";
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
            rgba(255, 255, 255, 0.05) 25%,
            rgba(255, 255, 255, 0.1) 50%,
            rgba(255, 255, 255, 0.05) 75%
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
