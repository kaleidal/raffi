<script lang="ts">
    import { onMount } from "svelte";
    import { userZoom } from "../../lib/stores/settingsStore";
    import { X, ZoomIn, ZoomOut, RotateCcw } from "lucide-svelte";
    import { fade, scale } from "svelte/transition";

    let showModal = false;

    onMount(() => {
        const hasSeenZoomModal = localStorage.getItem("has_seen_zoom_modal");
        if (!hasSeenZoomModal) {
            showModal = true;
        }
    });

    const close = () => {
        localStorage.setItem("has_seen_zoom_modal", "true");
        showModal = false;
    };

    const zoomIn = () => {
        userZoom.update(z => Math.min(z + 0.1, 2.0));
    };

    const zoomOut = () => {
        userZoom.update(z => Math.max(z - 0.1, 0.5));
    };

    const resetZoom = () => {
        userZoom.set(1.0);
    };
</script>

{#if showModal}
    <div
        class="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center"
        transition:fade={{ duration: 200 }}
    >
        <div
            class="bg-[#121212] w-full max-w-md rounded-[32px] p-6 md:p-10 flex flex-col gap-8 relative overflow-hidden shadow-[0_40px_160px_rgba(0,0,0,0.55)]"
            transition:scale={{ duration: 200, start: 0.95 }}
        >
            <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 class="text-white text-3xl font-poppins font-bold">Adjust UI Scale</h2>
                    <p class="text-white/60 text-sm">
                        Welcome to Raffi! You can adjust the UI scale to make everything look just right on your screen.
                    </p>
                </div>
                <div class="flex items-center gap-3 justify-end">
                    <button
                        class="text-white/50 hover:text-white cursor-pointer transition-colors"
                        on:click={close}
                    >
                        <X size={24} strokeWidth={2} />
                    </button>
                </div>
            </div>

            <div class="flex flex-col gap-6">
                <div class="flex items-center justify-center gap-4">
                    <button
                        class="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-white cursor-pointer"
                        on:click={zoomOut}
                        title="Zoom Out (Ctrl -)"
                    >
                        <ZoomOut size={24} />
                    </button>
                    
                    <div class="w-24 text-center">
                        <span class="text-2xl font-medium text-white">{Math.round($userZoom * 100)}%</span>
                    </div>

                    <button
                        class="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-white cursor-pointer"
                        on:click={zoomIn}
                        title="Zoom In (Ctrl +)"
                    >
                        <ZoomIn size={24} />
                    </button>
                </div>

                <div class="flex justify-center">
                    <button
                        class="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-white/80 hover:text-white text-sm cursor-pointer"
                        on:click={resetZoom}
                    >
                        <RotateCcw size={16} />
                        Reset to Default
                    </button>
                </div>

                <div class="bg-white/5 rounded-xl p-4 text-sm text-white/60">
                    <p class="mb-2 font-medium text-white/80">Keyboard Shortcuts:</p>
                    <ul class="space-y-1">
                        <li><kbd class="bg-black/50 px-1.5 py-0.5 rounded text-white/80">Ctrl</kbd> + <kbd class="bg-black/50 px-1.5 py-0.5 rounded text-white/80">+</kbd> to zoom in (if needed, try <kbd class="bg-black/50 px-1.5 py-0.5 rounded text-white/80">Ctrl</kbd> + <kbd class="bg-black/50 px-1.5 py-0.5 rounded text-white/80">Shift</kbd> + <kbd class="bg-black/50 px-1.5 py-0.5 rounded text-white/80">+</kbd>)</li>
                        <li><kbd class="bg-black/50 px-1.5 py-0.5 rounded text-white/80">Ctrl</kbd> + <kbd class="bg-black/50 px-1.5 py-0.5 rounded text-white/80">-</kbd> to zoom out</li>
                        <li><kbd class="bg-black/50 px-1.5 py-0.5 rounded text-white/80">Ctrl</kbd> + <kbd class="bg-black/50 px-1.5 py-0.5 rounded text-white/80">0</kbd> to reset</li>
                    </ul>
                    <p class="mt-3 text-xs">You can also change this later in Settings.</p>
                </div>
            </div>

            <div class="flex justify-end">
                <button
                    class="px-6 py-2.5 bg-white text-black font-semibold rounded-2xl hover:bg-white/90 transition-colors cursor-pointer"
                    on:click={close}
                >
                    Looks Good
                </button>
            </div>
        </div>
    </div>
{/if}
