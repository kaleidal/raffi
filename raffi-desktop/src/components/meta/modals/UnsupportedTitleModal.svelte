<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { fade, scale } from "svelte/transition";
    import { AlertTriangle } from "lucide-svelte";

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

    export let title: string = "Unsupported Title";
    export let message: string = "This title is not currently supported.";

    const dispatch = createEventDispatcher();

    function goBack() {
        dispatch("back");
    }

    function retry() {
        dispatch("retry");
    }
</script>

<div
    use:portal
    class="fixed inset-0 z-300 flex items-center justify-center bg-black/90 backdrop-blur-sm"
    transition:fade={{ duration: 200 }}
>
    <div
        class="bg-[#121212] rounded-2xl p-8 max-w-md w-full shadow-2xl flex flex-col gap-6"
        transition:scale={{ duration: 200, start: 0.95 }}
    >
        <div class="flex flex-col gap-3 text-center">
            <div class="flex justify-center mb-2">
                <div class="p-4 bg-red-500/10 rounded-full">
                <AlertTriangle size={48} color="currentColor" strokeWidth={2} class="h-12 w-12 text-red-500" />
                </div>
            </div>
            <h2 class="text-2xl font-bold text-white">{title}</h2>
            <p class="text-[#878787] leading-relaxed">
                {message}
            </p>
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
                Go Back
            </button>
        </div>
    </div>
</div>
