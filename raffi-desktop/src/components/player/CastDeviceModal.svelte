<script lang="ts">
    import { createEventDispatcher } from "svelte";

    type CastDevice = {
        id: string;
        name: string;
        host: string;
    };

    export let open = false;
    export let loading = false;
    export let loadingMode: "native" | "chrome" = "native";
    export let step: "mode" | "native-devices" = "mode";
    export let nativeDevices: CastDevice[] = [];
    export let onCancel: () => void;
    export let onNative: () => void;
    export let onChrome: () => void;
    export let onBackToMode: () => void;

    const dispatch = createEventDispatcher<{ selectNativeDevice: { deviceId: string } }>();
</script>

{#if open}
    <div
        class="fixed inset-0 z-[220] bg-black/80 backdrop-blur-sm flex items-center justify-center"
        role="dialog"
        aria-modal="true"
        tabindex="0"
        on:click|self={onCancel}
        on:keydown={(e) => {
            if (e.key === "Escape") onCancel();
        }}
    >
        <div class="w-[720px] max-w-[86vw] max-h-[82vh] rounded-[24px] border border-white/10 bg-[#181818]/90 backdrop-blur-xl text-white shadow-2xl p-6 flex flex-col gap-5">
            <div class="flex items-center justify-between">
                <h2 class="text-[28px] font-poppins font-medium">Cast to a device</h2>
                <button
                    class="bg-[#2C2C2C]/80 p-[12px] rounded-[14px] hover:bg-[#2C2C2C]/50 backdrop-blur-md transition-colors duration-300 cursor-pointer text-sm"
                    on:click={onCancel}
                >
                    Cancel
                </button>
            </div>

            {#if step === "mode"}
                <div class="grid grid-cols-2 gap-4">
                    <button
                        class="rounded-[20px] border border-white/15 bg-[#242424]/80 px-5 py-5 text-left transition-colors duration-200 hover:bg-[#2b2b2b]/90 disabled:opacity-50 disabled:cursor-not-allowed"
                        on:click={onChrome}
                        disabled={loading}
                    >
                        <p class="text-base font-semibold text-white">Cast via Chrome</p>
                        <p class="text-sm text-white/70 mt-2">Opens Chrome/Edge and starts casting with reliable device discovery.</p>
                    </button>

                    <button
                        class="rounded-[20px] border border-white/15 bg-[#242424]/80 px-5 py-5 text-left transition-colors duration-200 hover:bg-[#2b2b2b]/90 disabled:opacity-50 disabled:cursor-not-allowed"
                        on:click={onNative}
                        disabled={loading}
                    >
                        <p class="text-base font-semibold text-white">Attempt Native</p>
                        <p class="text-sm text-white/70 mt-2">Use in-app native casting with direct device selection.</p>
                    </button>
                </div>
            {:else}
                <div class="flex items-center justify-between">
                    <p class="text-sm text-white/70">Select a Chromecast device</p>
                    <button
                        class="rounded-[12px] bg-[#2C2C2C]/80 px-3 py-1.5 text-sm hover:bg-[#2C2C2C]/50"
                        on:click={onBackToMode}
                        disabled={loading}
                    >
                        Back
                    </button>
                </div>

                <div class="max-h-[300px] overflow-y-auto rounded-[20px] border border-white/10 bg-[#202020]/70 p-3 flex flex-col gap-2">
                    {#if nativeDevices.length === 0 && !loading}
                        <p class="text-sm text-white/60 px-2 py-3">No devices found yet. Keep this open and try again.</p>
                    {:else}
                        {#each nativeDevices as device}
                            <button
                                class="w-full rounded-[14px] border border-white/10 bg-[#2a2a2a]/80 px-4 py-3 text-left hover:bg-[#343434]/90 transition-colors"
                                on:click={() => dispatch("selectNativeDevice", { deviceId: device.id })}
                                disabled={loading}
                            >
                                <p class="text-sm font-medium text-white">{device.name || "Chromecast"}</p>
                                <p class="text-xs text-white/60 mt-1">{device.host}</p>
                            </button>
                        {/each}
                    {/if}
                </div>
            {/if}

            {#if loading}
                <div class="flex items-center gap-3 rounded-[20px] border border-white/10 bg-[#242424]/80 px-5 py-4">
                    <div class="h-5 w-5 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
                    <p class="text-sm text-white/80">
                        {loadingMode === "chrome" ? "Opening Chrome casting flow…" : "Opening native Cast picker…"}
                    </p>
                </div>
            {/if}
        </div>
    </div>
{/if}
