<script lang="ts">
    import { fullscreenPortal } from "../../common/portal";
    import { fade, scale } from "svelte/transition";

    export let reason: "host_left" | "party_deleted";
    export let onContinue: () => void;
    export let onLeave: () => void;

    const title = reason === "host_left" ? "Host Left Party" : "Party Ended";
    const message =
        reason === "host_left"
            ? "The host has left the watch party. You can continue watching on your own or return to browse."
            : "This watch party has ended. You can continue watching on your own or return to browse.";
</script>

<div
    use:fullscreenPortal
    class="raffi-modal-backdrop fixed inset-0 z-[300] flex items-center justify-center bg-canvas/90 backdrop-blur-sm"
    transition:fade={{ duration: 200 }}
>
    <div
        class="bg-canvas rounded-2xl p-8 max-w-md w-full shadow-2xl flex flex-col gap-6"
        transition:scale={{ duration: 200, start: 0.95 }}
    >
        <div class="flex flex-col gap-3 text-center">
            <div class="flex justify-center mb-2">
                <div class="p-4 bg-warning/10 rounded-full">
                    <svg
                        width="48"
                        height="48"
                        viewBox="0 0 24 24"
                        fill="none"
                        class="text-warning"
                    >
                        <circle
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            stroke-width="2"
                        />
                        <path
                            d="M12 8V12M12 16H12.01"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                        />
                    </svg>
                </div>
            </div>
            <h2 class="text-2xl font-bold text-ink">{title}</h2>
            <p class="text-ink/55 leading-relaxed">{message}</p>
        </div>

        <div class="flex flex-col gap-3">
            <button
                class="w-full py-3 px-4 bg-accent text-on-accent font-bold rounded-xl hover:bg-accent/85 transition-colors cursor-pointer"
                onclick={onContinue}
            >
                Continue Watching
            </button>
            <button
                class="w-full py-3 px-4 bg-raised text-ink font-medium rounded-xl hover:bg-ink/15 transition-colors cursor-pointer"
                onclick={onLeave}
            >
                Leave Player
            </button>
        </div>
    </div>
</div>
