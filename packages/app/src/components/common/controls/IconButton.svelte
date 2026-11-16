<script lang="ts">
    export let label: string = "";
    export let onClick: () => void = () => {};
</script>

<button
    class="icon-button bg-[#6e6e6e]/50 text-white hover:bg-[#7a7a7a]/55 flex flex-row items-center cursor-pointer w-auto rounded-full duration-200 ease-out"
    on:click={onClick}
    aria-label={label}
>
    <slot />
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
