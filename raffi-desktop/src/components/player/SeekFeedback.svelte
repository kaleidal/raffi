<script lang="ts">
    import { fade } from "svelte/transition";

    export let type: "forward" | "backward";
    export let id: number;

    let rotation = 0;

    $: if (id) {
        triggerAnimation();
    }

    function triggerAnimation() {
        rotation = -30;
        setTimeout(() => {
            rotation = 0;
        }, 10);
    }
</script>

<div
    class="absolute top-1/2 -translate-y-1/2 z-40 flex flex-col items-center justify-center text-white pointer-events-none
    {type === 'forward' ? 'left-[20%]' : 'right-[20%]'}"
    transition:fade={{ duration: 200 }}
>
    <div class="relative flex items-center justify-center">
        <div
            class="transition-transform duration-300 ease-out"
            style="transform: rotate({rotation}deg)"
        >
            {#if type === "forward"}
                <svg
                    width="80"
                    height="80"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M21 12C21 13.78 20.4722 15.5201 19.4832 17.0001C18.4943 18.4802 17.0887 19.6337 15.4441 20.3149C13.7996 20.9961 11.99 21.1743 10.2442 20.8271C8.49836 20.4798 6.89471 19.6226 5.63604 18.364C4.37736 17.1053 3.5202 15.5016 3.17293 13.7558C2.82566 12.01 3.00389 10.2004 3.68508 8.55585C4.36627 6.91131 5.51982 5.50571 6.99986 4.51677C8.47991 3.52784 10.22 3 12 3C14.52 3 16.93 4 18.74 5.74L21 8M21 8V3M21 8H16"
                        stroke="white"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            {:else}
                <svg
                    width="80"
                    height="80"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M3 12C3 13.78 3.52784 15.5201 4.51677 17.0001C5.50571 18.4802 6.91131 19.6337 8.55585 20.3149C10.2004 20.9961 12.01 21.1743 13.7558 20.8271C15.5016 20.4798 17.1053 19.6226 18.364 18.364C19.6226 17.1053 20.4798 15.5016 20.8271 13.7558C21.1743 12.01 20.9961 10.2004 20.3149 8.55585C19.6337 6.91131 18.4802 5.50571 17.0001 4.51677C15.5201 3.52784 13.78 3 12 3C9.48395 3.00947 7.06897 3.99122 5.26 5.74L3 8M3 8V3M3 8H8"
                        stroke="white"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            {/if}
        </div>

        <span class="absolute text-[24px] font-bold">5s</span>
    </div>
</div>
