<script lang="ts">
    import { portal } from "../../common/portal";
    import { fade, scale } from "svelte/transition";
    import { AlertTriangle } from "@lucide/svelte";

    export let title: string = "Unsupported Title";
    export let message: string = "This title is not currently supported.";

    export let onBack: () => void = () => {};
    export let onRetry: () => void = () => {};

    function goBack() {
        onBack();
    }

    function retry() {
        onRetry();
    }
</script>

<div
    use:portal
    class="raffi-modal-backdrop fixed inset-0 z-300 flex items-center justify-center bg-canvas/60 backdrop-blur-xl"
    transition:fade={{ duration: 200 }}
>
    <div
        class="max-w-md w-full rounded-2xl bg-raised/60 backdrop-blur-[40px] p-8 shadow-2xl flex flex-col gap-6"
        transition:scale={{ duration: 200, start: 0.95 }}
    >
        <div class="flex flex-col gap-3 text-center">
            <div class="flex justify-center mb-2">
                <div class="p-4 bg-danger/10 rounded-full">
                <AlertTriangle size={48} color="currentColor" strokeWidth={2} class="h-12 w-12 text-danger" />
                </div>
            </div>
            <h2 class="text-2xl font-bold text-ink">{title}</h2>
            <p class="text-ink/55 leading-relaxed">
                {message}
            </p>
        </div>

        <div class="flex flex-col gap-3">
            <button
                class="w-full py-3 px-4 bg-accent text-on-accent font-bold rounded-xl hover:bg-accent/85 transition-colors cursor-pointer"
                on:click={retry}
            >
                Try Again
            </button>
            <button
                class="w-full py-3 px-4 bg-raised text-ink font-medium rounded-xl hover:bg-ink/15 transition-colors cursor-pointer"
                on:click={goBack}
            >
                Go Back
            </button>
        </div>
    </div>
</div>
