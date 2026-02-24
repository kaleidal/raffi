<script lang="ts">
    export let open = false;
    export let loading = false;
    export let onCancel: () => void;
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

            {#if loading}
                <div class="flex items-center gap-3 rounded-[20px] border border-white/10 bg-[#242424]/80 px-5 py-4">
                    <div class="h-5 w-5 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
                    <p class="text-sm text-white/80">Opening Cast picker…</p>
                </div>
            {:else}
                <div class="rounded-[20px] border border-white/10 bg-[#242424]/80 px-5 py-4">
                    <p class="text-sm text-white/70">Choose your Chromecast device in the Cast window.</p>
                </div>
            {/if}
        </div>
    </div>
{/if}
