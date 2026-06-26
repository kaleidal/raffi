<script lang="ts">
    import { onMount } from "svelte";
    import { Check, ChevronDown, ListFilter } from "@lucide/svelte";
    import type { IptvGroup } from "../../../lib/iptv/types";

    export let groups: IptvGroup[] = [];
    export let selectedGroup = "__all__";
    export let allGroupsValue = "__all__";
    export let disabled = false;
    export let totalChannels = 0;

    let open = false;
    let root: HTMLDivElement;

    $: selectedGroupRow =
        groups.find((group) => group.name === selectedGroup) ?? null;
    $: selectedLabel =
        selectedGroup === allGroupsValue ? "All groups" : selectedGroup;
    $: selectedCount =
        selectedGroup === allGroupsValue
            ? totalChannels
            : selectedGroupRow?.channelCount ?? 0;

    function toggleMenu(event: MouseEvent) {
        event.stopPropagation();
        if (disabled) return;
        open = !open;
    }

    function closeMenu() {
        open = false;
    }

    function selectGroup(groupName: string) {
        selectedGroup = groupName;
        closeMenu();
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
        class="flex h-[80px] w-[202px] items-center gap-3 rounded-[24px] bg-[#2C2C2C]/80 px-4 text-left backdrop-blur-md transition-colors hover:bg-[#2C2C2C]/60 disabled:cursor-not-allowed disabled:opacity-45"
        aria-haspopup="listbox"
        aria-expanded={open}
        {disabled}
        onclick={toggleMenu}
    >
        <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/8 text-white/72">
            <ListFilter size={22} strokeWidth={2.2} />
        </span>
        <span class="min-w-0 flex-1">
            <span class="block truncate font-poppins text-base font-semibold text-white">
                {selectedLabel}
            </span>
            <span class="mt-0.5 block truncate text-xs text-white/48">
                {selectedCount} channels
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
            class="absolute left-0 top-[calc(100%+10px)] z-[260] w-[300px] overflow-hidden rounded-[24px] border border-white/10 bg-[#181818]/96 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl"
            role="listbox"
        >
            <div class="max-h-[360px] overflow-y-auto pr-1">
                <button
                    type="button"
                    class={`flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors ${
                        selectedGroup === allGroupsValue
                            ? "bg-white/[0.12] text-white"
                            : "text-white/76 hover:bg-white/[0.07] hover:text-white"
                    }`}
                    role="option"
                    aria-selected={selectedGroup === allGroupsValue}
                    onclick={() => selectGroup(allGroupsValue)}
                >
                    <span class="min-w-0 flex-1">
                        <span class="block truncate text-sm font-semibold">
                            All groups
                        </span>
                        <span class="mt-0.5 block text-xs text-white/42">
                            {totalChannels} channels
                        </span>
                    </span>
                    {#if selectedGroup === allGroupsValue}
                        <Check size={18} strokeWidth={2.4} class="shrink-0" />
                    {/if}
                </button>

                {#each groups as group}
                    <button
                        type="button"
                        class={`flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors ${
                            selectedGroup === group.name
                                ? "bg-white/[0.12] text-white"
                                : "text-white/76 hover:bg-white/[0.07] hover:text-white"
                        }`}
                        role="option"
                        aria-selected={selectedGroup === group.name}
                        onclick={() => selectGroup(group.name)}
                    >
                        <span class="min-w-0 flex-1">
                            <span class="block truncate text-sm font-semibold">
                                {group.name}
                            </span>
                            <span class="mt-0.5 block text-xs text-white/42">
                                {group.channelCount} channels
                            </span>
                        </span>
                        {#if selectedGroup === group.name}
                            <Check size={18} strokeWidth={2.4} class="shrink-0" />
                        {/if}
                    </button>
                {/each}
            </div>
        </div>
    {/if}
</div>
