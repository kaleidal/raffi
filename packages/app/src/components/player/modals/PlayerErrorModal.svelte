<script lang="ts">
    import { fullscreenPortal } from "../../common/portal";
    import { fade, scale } from "svelte/transition";
    import { isWeb } from "../../../lib/shell/platform";
    import { MonitorDown } from "@lucide/svelte";

    export let errorMessage: string = "Stream failed to load";
    export let errorDetails: string = "";

    export let onRetry: () => void = () => {};
    export let onBack: () => void = () => {};
    export let onDownloadDesktop: () => void = () => {};

    function retry() {
        onRetry();
    }

    function goBack() {
        onBack();
    }

    function downloadDesktop() {
        onDownloadDesktop();
    }
</script>

<div
    use:fullscreenPortal
    class="raffi-modal-backdrop fixed inset-0 z-[300] flex items-center justify-center bg-canvas/56 backdrop-blur-xl"
    transition:fade={{ duration: 200 }}
>
    <div
        class="w-full max-w-md rounded-[32px] bg-raised/58 backdrop-blur-[40px] p-8 shadow-[0_40px_160px_rgba(0,0,0,0.45)] flex flex-col gap-6"
        transition:scale={{ duration: 200, start: 0.95 }}
    >
        <div class="flex flex-col gap-3 text-center">
            <div class="flex justify-center mb-2">
                <div class="p-4 bg-danger/10 rounded-full">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-12 w-12 text-danger"
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
            <h2 class="text-2xl font-bold text-ink">Playback Error</h2>
            <p class="text-ink/55 leading-relaxed">
                {errorMessage}
            </p>
            {#if errorDetails}
                <p class="text-ink/55 text-sm font-mono">
                    {errorDetails}
                </p>
            {/if}
        </div>

        <div class="flex flex-col gap-3">
            <button
                class="w-full py-3 px-4 bg-accent text-on-accent text-[15px] font-semibold rounded-xl hover:bg-accent/85 transition-colors cursor-pointer"
                on:click={retry}
            >
                Try Again
            </button>
            <button
                class="w-full py-3 px-4 bg-raised text-ink text-[15px] font-semibold rounded-xl hover:bg-ink/15 transition-colors cursor-pointer"
                on:click={goBack}
            >
                Back to Streams
            </button>
            {#if isWeb}
                <button
                    class="w-full py-3 px-4 bg-ink/8 text-ink text-[15px] font-semibold rounded-xl hover:bg-ink/14 transition-colors cursor-pointer flex items-center justify-center gap-2"
                    on:click={downloadDesktop}
                >
                    <MonitorDown size={18} strokeWidth={2} />
                    Download Desktop App
                </button>
            {/if}
        </div>
    </div>
</div>
