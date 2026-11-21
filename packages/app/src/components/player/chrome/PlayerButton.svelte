<script lang="ts">
    import type { Snippet } from "svelte";

    let {
        label,
        active = false,
        onclick,
        children,
    }: { label: string; active?: boolean; onclick: () => void; children: Snippet } = $props();
</script>

<button
    class="player-button flex shrink-0 cursor-pointer items-center justify-center rounded-full text-ink/80 transition-[background-color,color,scale] duration-150 hover:bg-ink/12 hover:text-ink active:scale-90"
    class:active
    aria-label={label}
    aria-pressed={active}
    title={label}
    {onclick}
>
    {@render children()}
</button>

<style>
    .player-button.active {
        background: color-mix(in oklab, var(--raffi-ink) 16%, transparent);
        color: var(--raffi-ink);
    }

    .player-button {
        width: clamp(40px, 2.7vw, 52px);
        height: clamp(40px, 2.7vw, 52px);
    }

    .player-button :global(svg) {
        width: clamp(20px, 1.35vw, 26px);
        height: clamp(20px, 1.35vw, 26px);
    }
</style>
