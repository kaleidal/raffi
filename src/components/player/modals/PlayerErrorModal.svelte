<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { fade, scale } from "svelte/transition";

    const portal = (node: HTMLElement) => {
        if (typeof document === "undefined") {
            return { destroy() {} };
        }
        document.body.appendChild(node);
        return {
            destroy() {
                if (node.parentNode) {
                    node.parentNode.removeChild(node);
                }
            },
        };
    };


    export let errorMessage: string = "Stream failed to load";
    export let errorDetails: string = "";

    const dispatch = createEventDispatcher();

    function retry() {
        dispatch("retry");
    }

    function goBack() {
        dispatch("back");
    }
</script>

<div
    use:portal
    class="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 backdrop-blur-sm"
    transition:fade={{ duration: 200 }}
>
    <div
        class="bg-[#121212] rounded-2xl p-8 max-w-md w-full shadow-2xl flex flex-col gap-6"
        transition:scale={{ duration: 200, start: 0.95 }}
    >
        <div class="flex flex-col gap-3 text-center">
            <div class="flex justify-center mb-2">
                <div class="p-4 bg-red-500/10 rounded-full">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-12 w-12 text-red-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                </div>
            </div>
            <h2 class="text-2xl font-bold text-white">Playback Error</h2>
            <p class="text-[#878787] leading-relaxed">
                {errorMessage}
            </p>
            {#if errorDetails}
                <p class="text-[#878787] text-sm font-mono">
                    {errorDetails}
                </p>
            {/if}
        </div>

        <div class="flex flex-col gap-3">
            <button
                class="w-full py-3 px-4 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-colors cursor-pointer"
                on:click={retry}
            >
                Try Again
            </button>
            <button
                class="w-full py-3 px-4 bg-[#333] text-white font-medium rounded-xl hover:bg-[#444] transition-colors cursor-pointer"
                on:click={goBack}
            >
                Back to Streams
            </button>
        </div>
    </div>
</div>
