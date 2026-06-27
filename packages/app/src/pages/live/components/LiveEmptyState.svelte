<script lang="ts">
    import { Plus, RefreshCw, Tv } from "@lucide/svelte";
    import LoadingSpinner from "../../../components/common/LoadingSpinner.svelte";

    export let state:
        | "refreshing"
        | "no-source"
        | "needs-refresh"
        | "no-results" = "no-results";
    export let sourceName = "";
    export let onAddSource: () => void = () => {};
    export let onRefreshSource: () => void = () => {};
    export let onManageSources: () => void = () => {};
</script>

{#if state === "refreshing"}
    <section class="flex min-h-[52vh] items-center justify-center rounded-[28px] border border-white/10 bg-[#2b2b2b]/56 backdrop-blur-xl">
        <div class="flex flex-col items-center gap-4 text-white/64">
            <LoadingSpinner size="46px" />
            <span>Refreshing channels</span>
        </div>
    </section>
{:else if state === "no-source"}
    <section class="flex min-h-[52vh] items-center justify-center rounded-[28px] border border-white/10 bg-[#2b2b2b]/56 p-6 text-center backdrop-blur-xl">
        <div class="flex max-w-xl flex-col items-center gap-4">
            <div class="flex h-16 w-16 items-center justify-center rounded-[24px] bg-white/8">
                <Tv size={30} strokeWidth={2} class="text-white/70" />
            </div>
            <div>
                <h2 class="font-poppins text-2xl font-semibold">
                    Add a Live TV Source
                </h2>
                <p class="mt-2 text-sm leading-6 text-white/60">
                    Connect an M3U playlist or Xtream account to load channels and guide data.
                </p>
            </div>
            <button
                class="flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition-opacity hover:opacity-88"
                onclick={onAddSource}
            >
                <Plus size={17} strokeWidth={2.4} />
                Add Source
            </button>
        </div>
    </section>
{:else if state === "needs-refresh"}
    <section class="flex min-h-[52vh] items-center justify-center rounded-[28px] border border-white/10 bg-[#2b2b2b]/56 p-6 text-center backdrop-blur-xl">
        <div class="flex max-w-xl flex-col items-center gap-4">
            <div class="flex h-16 w-16 items-center justify-center rounded-[24px] bg-white/8">
                <RefreshCw size={28} strokeWidth={2} class="text-white/70" />
            </div>
            <div>
                <h2 class="font-poppins text-2xl font-semibold">
                    Load Channels
                </h2>
                <p class="mt-2 text-sm leading-6 text-white/60">
                    Refresh {sourceName} to cache channels and guide data for this device.
                </p>
            </div>
            <div class="flex flex-wrap justify-center gap-3">
                <button
                    class="flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition-opacity hover:opacity-88"
                    onclick={onRefreshSource}
                >
                    <RefreshCw size={17} strokeWidth={2.4} />
                    Refresh Source
                </button>
                <button
                    class="h-11 rounded-full border border-white/10 bg-white/8 px-5 text-sm font-semibold text-white/76 transition-colors hover:bg-white/14 hover:text-white"
                    onclick={onManageSources}
                >
                    Manage Sources
                </button>
            </div>
        </div>
    </section>
{:else}
    <section class="flex min-h-[52vh] items-center justify-center rounded-[28px] border border-white/10 bg-[#2b2b2b]/56 p-6 text-center text-white/60 backdrop-blur-xl">
        No channels match the current filters.
    </section>
{/if}
