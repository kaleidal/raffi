<script lang="ts">
    export let background: string | null;
    export let backgroundFailed: boolean;
</script>

{#if background && !backgroundFailed}
    <img
        src={background}
        alt="Background"
        class="w-full h-full object-cover"
        on:error={() => (backgroundFailed = true)}
    />
{:else}
    <div
        class="w-full h-full bg-gradient-to-b from-surface to-canvas"
    ></div>
{/if}

<div
    class="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-canvas"
></div>
