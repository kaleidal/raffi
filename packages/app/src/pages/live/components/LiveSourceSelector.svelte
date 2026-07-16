<script lang="ts">
    import { onMount } from "svelte";
    import {
        Check,
        ChevronDown,
        Database,
        Plus,
        RefreshCw,
        Settings2,
    } from "@lucide/svelte";
    import LoadingSpinner from "../../../components/common/LoadingSpinner.svelte";
    import type { IptvSource } from "../../../lib/iptv/types";

    export let sources: IptvSource[] = [];
    export let selectedSourceId = "";
    export let sourceSummary = "";
    export let refreshedLabel = "";
    export let refreshing = false;
    export let onManage: () => void = () => {};
    export let onRefresh: () => void = () => {};

    let open = false;
    let root: HTMLDivElement;

    $: selectedSource =
        sources.find((source) => source.id === selectedSourceId) ?? null;
    $: canRefresh = Boolean(selectedSource) && !refreshing;

    function toggleMenu(event: MouseEvent) {
        event.stopPropagation();
        open = !open;
    }

    function closeMenu() {
        open = false;
    }

    function selectSource(sourceId: string) {
        selectedSourceId = sourceId;
        closeMenu();
    }

    function openManager() {
        closeMenu();
        onManage();
    }

    function refreshSource() {
        if (!canRefresh) return;
        closeMenu();
        onRefresh();
    }

    function handleDocumentPointerDown(event: PointerEvent) {
        if (root && !root.contains(event.target as Node)) {
            closeMenu();
        }
    }

    onMount(() => {
        document.addEventListener("pointerdown", handleDocumentPointerDown);
        return () => {
            document.removeEventListener("pointerdown", handleDocumentPointerDown);
        };
    });
</script>

<svelte:window onkeydown={(event) => {
    if (event.key === "Escape") closeMenu();
}} />

<div class="relative" bind:this={root}>
    <button
        type="button"
        class="flex h-[80px] w-[242px] items-center gap-3 rounded-[24px] bg-[#2C2C2C]/80 px-4 text-left backdrop-blur-md transition-colors hover:bg-[#2C2C2C]/60"
        aria-haspopup="listbox"
        aria-expanded={open}
        onclick={toggleMenu}
    >
        <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/8 text-white/72">
            <Database size={22} strokeWidth={2.2} />
        </span>
        <span class="min-w-0 flex-1">
            <span class="block truncate font-poppins text-base font-semibold text-white">
                {selectedSource?.name ?? "Live source"}
            </span>
            <span class="mt-0.5 block truncate text-xs text-white/48">
                {refreshedLabel || sourceSummary}
            </span>
        </span>
        <ChevronDown
            size={19}
            strokeWidth={2.2}
            class={`shrink-0 text-white/54 transition-transform ${open ? "rotate-180" : ""}`}
        />
    </button>

    {#if open}
        <div
            class="absolute left-0 top-[calc(100%+10px)] z-[260] w-[330px] overflow-hidden rounded-[24px] border border-white/10 bg-[#181818]/96 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl"
            role="listbox"
        >
            {#if sources.length > 0}
                <div class="max-h-[310px] overflow-y-auto pr-1">
                    {#each sources as source}
                        <button
                            type="button"
                            class={`flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors ${
                                selectedSourceId === source.id
                                    ? "bg-white/[0.12] text-white"
                                    : "text-white/76 hover:bg-white/[0.07] hover:text-white"
                            }`}
                            role="option"
                            aria-selected={selectedSourceId === source.id}
                            onclick={() => selectSource(source.id)}
                        >
                            <span class="min-w-0 flex-1">
                                <span class="block truncate text-sm font-semibold">
                                    {source.name}
                                </span>
                                <span class="mt-0.5 block text-xs uppercase tracking-[0.12em] text-white/38">
                                    {source.kind === "xtream" ? "Xtream" : "M3U"}
                                </span>
                            </span>
                            {#if selectedSourceId === source.id}
                                <Check size={18} strokeWidth={2.4} class="shrink-0" />
                            {/if}
                        </button>
                    {/each}
                </div>
            {:else}
                <div class="px-3 py-5 text-sm text-white/54">
                    No source configured yet.
                </div>
            {/if}

            <div class="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-2">
                <button
                    type="button"
                    class="flex h-11 items-center justify-center gap-2 rounded-full bg-white/8 px-3 text-sm font-semibold text-white/74 transition-colors hover:bg-white/14 hover:text-white"
                    onclick={openManager}
                >
                    {#if sources.length > 0}
                        <Settings2 size={17} strokeWidth={2.2} />
                        Sources
                    {:else}
                        <Plus size={17} strokeWidth={2.2} />
                        Add
                    {/if}
                </button>
                <button
                    type="button"
                    class="flex h-11 items-center justify-center gap-2 rounded-full bg-white px-3 text-sm font-semibold text-black transition-opacity hover:opacity-88 disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={!canRefresh}
                    onclick={refreshSource}
                >
                    {#if refreshing}
                        <LoadingSpinner size="15px" color="#111111" />
                    {:else}
                        <RefreshCw size={17} strokeWidth={2.2} />
                    {/if}
                    Refresh
                </button>
            </div>
        </div>
    {/if}
</div>
