<script lang="ts">
    import type { Snippet } from "svelte";

    let { label, onclick, children }: { label: string; onclick: () => void; children: Snippet } = $props();
</script>

<button
    class="player-button flex shrink-0 cursor-pointer items-center justify-center rounded-full text-ink/80 transition-[background-color,color,scale] duration-150 hover:bg-ink/12 hover:text-ink active:scale-90"
    aria-label={label}
    title={label}
    {onclick}
>
    {@render children()}
</button>

<style>
    .player-button {
        width: clamp(40px, 2.7vw, 52px);
        height: clamp(40px, 2.7vw, 52px);
    }

    .player-button :global(svg) {
        width: clamp(20px, 1.35vw, 26px);
        height: clamp(20px, 1.35vw, 26px);
    }
</style>
