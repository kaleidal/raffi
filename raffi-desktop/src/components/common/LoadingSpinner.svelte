<script lang="ts">
    export let size = "40px";
    export let color = "#FFFFFF";
</script>

<div class="spinner" style="--size: {size}; --color: {color}">
    <svg viewBox="0 0 50 50">
        <circle cx="25" cy="25" r="20" fill="none" stroke-width="4"></circle>
    </svg>
</div>

<style>
    .spinner {
        width: var(--size);
        height: var(--size);
        animation: rotate 2s linear infinite;
    }

    .spinner circle {
        stroke: var(--color);
        stroke-linecap: round;
        animation: dash 1.5s ease-in-out infinite;
    }

    @keyframes rotate {
        100% {
            transform: rotate(360deg);
        }
    }

    @keyframes dash {
        0% {
            stroke-dasharray: 1, 150;
            stroke-dashoffset: 0;
        }
        50% {
            stroke-dasharray: 90, 150;
            stroke-dashoffset: -35;
        }
        100% {
            stroke-dasharray: 90, 150;
            stroke-dashoffset: -124;
        }
    }
</style>
