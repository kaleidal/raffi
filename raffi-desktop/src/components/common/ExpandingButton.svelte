<script lang="ts">
    import type { TransitionConfig } from "svelte/transition";
    import { quintOut } from "svelte/easing";

    let hovered = false;
    export let label: string = "";
    export let onClick: () => void = () => {};

    function fadeSlide(
        node: HTMLElement,
        { x = 4, duration = 150 } = {}
    ): TransitionConfig {
        const style = getComputedStyle(node);
        const opacity = +style.opacity || 1;
        const transform = style.transform === "none" ? "" : style.transform;

        return {
            duration,
            easing: quintOut,
            css: (t) => {
                const u = 1 - t;
                return `
          opacity: ${t * opacity};
          transform: ${transform} translateX(${u * x}px);
        `;
            },
        };
    }
</script>

<button
    class="bg-[#6E6E6E]/50 flex flex-row gap-[10px] items-center h-[48px] cursor-pointer w-auto rounded-full px-[15px] transition-all duration-200 ease-out"
    on:mouseenter={() => (hovered = true)}
    on:mouseleave={() => (hovered = false)}
    on:click={onClick}
>
    <slot />

    {#if hovered}
      <span
              class="font-poppins text-[#E9E9E9] font-medium whitespace-nowrap"
              in:fadeSlide={{ x: 4, duration: 150 }}
      >
        {label}
      </span>
    {/if}
</button>
