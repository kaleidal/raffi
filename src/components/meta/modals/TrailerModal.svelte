<script lang="ts">
    import { fade, scale } from "svelte/transition";
    import { createEventDispatcher } from "svelte";

    export let visible = false;
    export let ytId: string;

    const dispatch = createEventDispatcher();

    function close() {
        visible = false;
        dispatch("close");
    }
</script>

{#if visible}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
        transition:fade={{ duration: 200 }}
        on:click|self={close}
    >
        <div
            class="relative w-[80%] h-[80%] max-w-[1200px] bg-black rounded-2xl overflow-hidden shadow-2xl"
            transition:scale={{ duration: 200, start: 0.95 }}
        >
            <button
                class="absolute top-4 right-4 z-10 p-2 bg-black/50 hover:bg-black/80 rounded-full text-white transition-colors cursor-pointer"
                on:click={close}
                aria-label="Close Trailer"
            >
                <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
            
            <iframe
                src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&modestbranding=1&rel=0`}
                title="Trailer"
                class="w-full h-full"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
            ></iframe>
        </div>
    </div>
{/if}
