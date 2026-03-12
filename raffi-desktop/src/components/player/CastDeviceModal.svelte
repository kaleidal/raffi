<script lang="ts">
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
    export let onSelectNativeDevice: (detail: { deviceId: string }) => void = () => {};
</script>

{#if open}
    <div
        class="fixed inset-0 z-[220] bg-[#101010]/58 backdrop-blur-xl flex items-center justify-center p-5"
        role="dialog"
        aria-modal="true"
        tabindex="0"
        on:click|self={onCancel}
        on:keydown={(e) => {
            if (e.key === "Escape") onCancel();
        }}
    >
        <div class="w-full max-w-[760px] max-h-[82vh] rounded-4xl bg-[#2b2b2b]/56 backdrop-blur-[40px] text-white shadow-[0_40px_160px_rgba(0,0,0,0.45)] p-6 md:p-8 flex flex-col gap-6 overflow-hidden">
            <div class="flex items-start justify-between gap-4">
                <div class="space-y-2">
                    <p class="text-[12px] uppercase tracking-[0.18em] text-white/42 font-semibold">Chromecast</p>
                    <h2 class="text-[30px] leading-none font-poppins font-semibold">Cast to a device</h2>
                    <p class="text-sm text-white/58 max-w-[420px]">
                        Pick the cast flow that fits this session, then hand playback off without losing your place.
                    </p>
                </div>
                <button
                    class="rounded-2xl bg-white/8 px-4 py-2.5 text-sm font-medium text-white/82 hover:bg-white/14 transition-colors cursor-pointer shrink-0"
                    on:click={onCancel}
                >
                    Close
                </button>
            </div>

            {#if step === "mode"}
                <div class="grid gap-4 md:grid-cols-2">
                    <button
                        class="rounded-[28px] bg-white/[0.07] px-6 py-6 text-left transition-colors duration-200 hover:bg-white/[0.1] disabled:opacity-50 disabled:cursor-not-allowed min-h-[220px] flex flex-col justify-between"
                        on:click={onChrome}
                        disabled={loading}
                    >
                        <div class="space-y-3">
                            <p class="text-[11px] uppercase tracking-[0.18em] text-white/40 font-semibold">Recommended</p>
                            <p class="text-xl font-semibold text-white">Browser Cast</p>
                            <p class="text-sm text-white/65 leading-relaxed">
                                Opens Chrome or Edge for the most reliable device picker and Chromecast session handoff.
                            </p>
                        </div>
                        <p class="text-sm font-medium text-white/72">Best when device discovery is flaky.</p>
                    </button>

                    <button
                        class="rounded-[28px] bg-white/[0.07] px-6 py-6 text-left transition-colors duration-200 hover:bg-white/[0.1] disabled:opacity-50 disabled:cursor-not-allowed min-h-[220px] flex flex-col justify-between"
                        on:click={onNative}
                        disabled={loading}
                    >
                        <div class="space-y-3">
                            <p class="text-[11px] uppercase tracking-[0.18em] text-white/40 font-semibold">In App</p>
                            <p class="text-xl font-semibold text-white">Native Cast</p>
                            <p class="text-sm text-white/65 leading-relaxed">
                                Stays inside Raffi and connects directly to Chromecast devices we discover on your LAN.
                            </p>
                        </div>
                        <p class="text-sm font-medium text-white/72">Faster when native discovery works cleanly.</p>
                    </button>
                </div>
            {:else}
                <div class="flex items-center justify-between gap-3">
                    <div>
                        <p class="text-lg font-semibold text-white">Choose a Chromecast</p>
                        <p class="text-sm text-white/58">Available devices on your local network.</p>
                    </div>
                    <button
                        class="rounded-2xl bg-white/8 px-4 py-2 text-sm font-medium text-white/82 hover:bg-white/14 transition-colors"
                        on:click={onBackToMode}
                        disabled={loading}
                    >
                        Back
                    </button>
                </div>

                <div class="max-h-[360px] overflow-y-auto rounded-[28px] bg-black/18 p-3 flex flex-col gap-2">
                    {#if nativeDevices.length === 0 && !loading}
                        <div class="rounded-[22px] bg-white/[0.05] px-4 py-5 text-sm text-white/58">
                            No devices found yet. Keep this open for a moment or switch to Browser Cast.
                        </div>
                    {:else}
                        {#each nativeDevices as device}
                            <button
                                class="w-full rounded-[22px] bg-white/[0.06] px-4 py-4 text-left hover:bg-white/[0.1] transition-colors"
                                on:click={() => onSelectNativeDevice({ deviceId: device.id })}
                                disabled={loading}
                            >
                                <div class="flex items-center justify-between gap-4">
                                    <div class="min-w-0">
                                        <p class="text-base font-medium text-white truncate">{device.name || "Chromecast"}</p>
                                        <p class="text-xs text-white/50 mt-1 truncate">{device.host}</p>
                                    </div>
                                    <span class="rounded-full bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/52 shrink-0">
                                        Cast
                                    </span>
                                </div>
                            </button>
                        {/each}
                    {/if}
                </div>
            {/if}

            {#if loading}
                <div class="flex items-center gap-3 rounded-[24px] bg-white/[0.07] px-5 py-4">
                    <div class="h-5 w-5 rounded-full border-2 border-white/26 border-t-white animate-spin"></div>
                    <p class="text-sm text-white/78">
                        {loadingMode === "chrome" ? "Opening browser cast flow..." : "Scanning for Chromecast devices..."}
                    </p>
                </div>
            {/if}
        </div>
    </div>
{/if}
