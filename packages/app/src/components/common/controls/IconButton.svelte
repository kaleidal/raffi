<script lang="ts">
    import type { Snippet } from "svelte";

    let { label = "", onClick, children }: { label?: string; onClick: () => void; children: Snippet } = $props();
</script>

<button
    class="icon-button flex w-auto cursor-pointer flex-row items-center rounded-full bg-ink/12 text-ink backdrop-blur-md duration-200 ease-out hover:bg-ink/20 active:scale-95"
    onclick={onClick}
    aria-label={label}
    title={label}
>
    {@render children()}
</button>

<style>
    .icon-button {
        height: clamp(44px, 2.5vw, 48px);
        gap: clamp(7px, 0.52vw, 10px);
        padding-inline: clamp(13px, 0.78vw, 15px);
        transition-property: background-color, opacity, scale;
    }

    .icon-button :global(svg) {
        width: clamp(19px, 1.25vw, 24px);
        height: clamp(19px, 1.25vw, 24px);
    }
</style>
