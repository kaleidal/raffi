<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { fade, scale } from "svelte/transition";

    const portal = (node: HTMLElement) => {
        if (typeof document === "undefined") {
            return { destroy() {} };
        }
        const target = document.fullscreenElement || document.body;
        target.appendChild(node);
        return {
            destroy() {
                if (node.parentNode) {
                    node.parentNode.removeChild(node);
                }
            },
        };
    };


    type SeekBarStyle = "raffi" | "normal";

    export let seekBarStyle: SeekBarStyle = "raffi";

    const dispatch = createEventDispatcher<{
        styleChange: { style: SeekBarStyle };
        acknowledge: void;
    }>();

    let localStyle: SeekBarStyle = seekBarStyle;

    $: if (seekBarStyle !== localStyle) {
        localStyle = seekBarStyle;
    }

    function toggleSeekStyle() {
        localStyle = localStyle === "raffi" ? "normal" : "raffi";
        dispatch("styleChange", { style: localStyle });
    }

    function acknowledge() {
        dispatch("acknowledge");
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
                <div class="p-4 bg-white/10 rounded-full">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-12 w-12 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
                        />
                    </svg>
                </div>
            </div>

            <h2 class="text-2xl font-bold text-white">Seek Bar Style</h2>

            <div class="text-[#878787] leading-relaxed flex flex-col gap-2">
                <p>
                    Raffi uses an inverted seek style:
                </p>
                <p>
                    Left goes forward, right goes backward.
                </p>
                <p>
                    The time next to the bar shows time remaining.
                </p>
            </div>
        </div>

        <div class="flex flex-col gap-3">
            <div class="flex flex-col gap-2">
                <div class="text-[#878787] text-sm">Choose your preference</div>
                <button
                    class="relative h-9 w-full rounded-full border border-white/10 transition-colors duration-200 cursor-pointer bg-white/10 p-1"
                    on:click={toggleSeekStyle}
                    aria-label="Toggle Seek Bar Style"
                    type="button"
                >
                    <div class="relative z-10 flex w-full h-full items-center">
                        <span
                            class={`flex-1 text-center text-xs font-semibold tracking-wider transition-colors duration-200 ${localStyle === "raffi" ? "text-black" : "text-white/60"}`}
                            >RAFFI</span
                        >
                        <span
                            class={`flex-1 text-center text-xs font-semibold tracking-wider transition-colors duration-200 ${localStyle === "normal" ? "text-black" : "text-white/60"}`}
                            >NORMAL</span
                        >
                    </div>
                    <div
                        class={`absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] bg-white rounded-full transition-transform duration-200 ${localStyle === "normal" ? "translate-x-full" : "translate-x-0"}`}
                    ></div>
                </button>
            </div>

            <button
                class="w-full py-3 px-4 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-colors cursor-pointer"
                on:click={acknowledge}
                type="button"
            >
                Acknowledge
            </button>
        </div>
    </div>
</div>
