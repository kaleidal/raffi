<script lang="ts">
    import { onMount } from "svelte";
    import { get, writable } from "svelte/store";
    import { ChevronDown, ChevronRight, Dices } from "@lucide/svelte";
    import {
        lists,
        editingState,
        listItemsMap,
    } from "../listsState";
    import {
        startEditing,
        saveListName,
        moveList,
        handleDeleteList,
    } from "../listActions";
    import { selectItem } from "../dataLoader";
    import { fade } from "svelte/transition";

    const COLLAPSED_LISTS_KEY = "raffi:lists:collapsed";
    const collapsedListIds = writable<Record<string, true>>({});

    onMount(() => {
        try {
            const value = localStorage.getItem(COLLAPSED_LISTS_KEY);
            const parsed = value ? JSON.parse(value) : [];
            if (Array.isArray(parsed)) {
                collapsedListIds.set(Object.fromEntries(
                    parsed
                        .filter((id) => typeof id === "string")
                        .map((id) => [id, true]),
                ));
            }
        } catch {
            collapsedListIds.set({});
        }
    });

    function saveCollapsedLists(next: Record<string, true>) {
        collapsedListIds.set(next);
        try {
            localStorage.setItem(COLLAPSED_LISTS_KEY, JSON.stringify(Object.keys(next)));
        } catch {}
    }

    function toggleListCollapsed(listId: string) {
        const next = { ...get(collapsedListIds) };
        if (next[listId]) {
            delete next[listId];
        } else {
            next[listId] = true;
        }
        saveCollapsedLists(next);
    }

    function selectFirstItem(listId: string) {
        const items = $listItemsMap[listId];
        if (items && items.length > 0) {
            selectItem(items[0], listId);
        }
    }

    function selectRandomItem(listId: string) {
        const items = $listItemsMap[listId] || [];
        if (!items.length) return;
        const randomIndex = Math.floor(Math.random() * items.length);
        selectItem(items[randomIndex], listId);
    }
</script>

<div
    class="w-full min-w-0 min-h-0 flex flex-col overflow-y-auto no-scrollbar relative z-10 overflow-x-hidden xl:pr-[20px]"
>
    <div class="flex flex-col gap-12 pb-20 xl:gap-[60px] xl:pb-[100px]">
        {#each $lists as list (list.list_id)}
            <div class="flex flex-col gap-5">
                <div
                    class="flex flex-row justify-between items-center group/header"
                >
                    {#if $editingState.listId === list.list_id}
                        <form
                            class="flex-1 flex flex-row gap-2"
                            on:submit|preventDefault={saveListName}
                        >
                            <input
                                type="text"
                                bind:value={$editingState.name}
                                class="bg-transparent text-[#FFFFFF] text-[32px] font-poppins font-semibold border-b border-white/20 focus:border-white outline-none w-full"
                                on:blur={saveListName}
                            />
                        </form>
                    {:else}
                        <div class="flex flex-row gap-3 items-center min-w-0">
                            <button
                                type="button"
                                class="shrink-0 text-white/55 hover:text-white transition-colors cursor-pointer p-2 rounded-lg hover:bg-white/10"
                                on:click={() => toggleListCollapsed(list.list_id)}
                                aria-label={$collapsedListIds[list.list_id]
                                    ? `Expand ${list.name}`
                                    : `Collapse ${list.name}`}
                            >
                                {#if $collapsedListIds[list.list_id]}
                                    <ChevronRight size={22} strokeWidth={2.2} />
                                {:else}
                                    <ChevronDown size={22} strokeWidth={2.2} />
                                {/if}
                            </button>
                            <h3 class="min-w-0">
                                <button
                                    type="button"
                                    class="block min-w-0 max-w-full truncate text-left text-[#FFFFFF] text-[28px] xl:text-[32px] font-poppins font-semibold cursor-pointer hover:text-white/80 transition-colors"
                                    on:click={() => selectFirstItem(list.list_id)}
                                    on:dblclick={() => startEditing(list)}
                                >
                                    {list.name}
                                </button>
                            </h3>
                            <div
                                class="flex flex-col gap-1 opacity-0 group-hover/header:opacity-100 transition-opacity"
                            >
                                <button
                                    type="button"
                                    class="text-white/50 hover:text-white cursor-pointer"
                                    on:click={() =>
                                        moveList($lists.indexOf(list), "up")}
                                    disabled={$lists.indexOf(list) === 0}
                                    aria-label="Move list up"
                                >
                                    <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        ><polyline points="18 15 12 9 6 15"
                                        ></polyline></svg
                                    >
                                </button>
                                <button
                                    type="button"
                                    aria-label="Move list down"
                                    class="text-white/50 hover:text-white cursor-pointer"
                                    on:click={() =>
                                        moveList($lists.indexOf(list), "down")}
                                    disabled={$lists.indexOf(list) ===
                                        $lists.length - 1}
                                >
                                    <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        ><polyline points="6 9 12 15 18 9"
                                        ></polyline></svg
                                    >
                                </button>
                            </div>
                        </div>
                    {/if}

                    <div class="flex flex-row gap-2">
                        <button
                            type="button"
                            class="text-white/50 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            on:click={() => selectRandomItem(list.list_id)}
                            disabled={!$listItemsMap[list.list_id]?.length}
                            aria-label="Pick random title"
                        >
                            <Dices size={20} strokeWidth={2} />
                        </button>
                        <button
                            type="button"
                            class="text-white/50 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg cursor-pointer"
                            on:click={() => startEditing(list)}
                            aria-label="Rename list"
                        >
                            <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                ><path
                                    d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                                ></path><path
                                    d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                                ></path></svg
                            >
                        </button>
                        <button
                            type="button"
                            class="text-[#FF4444] opacity-50 hover:opacity-100 transition-opacity p-2 hover:bg-[#FF4444]/10 rounded-lg cursor-pointer"
                            on:click={() => handleDeleteList(list.list_id)}
                            aria-label="Delete list"
                        >
                            <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                ><polyline points="3 6 5 6 21 6"
                                ></polyline><path
                                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                                ></path></svg
                            >
                        </button>
                    </div>
                </div>

                <div class="w-full h-[1px] bg-[#333333]"></div>

                {#if !$collapsedListIds[list.list_id]}
                    <div transition:fade={{ duration: 160 }}>
                        <slot name="grid" listId={list.list_id} />
                    </div>
                {/if}
            </div>
        {/each}


    </div>
</div>

<style>
    .no-scrollbar::-webkit-scrollbar {
        display: none;
    }
    .no-scrollbar {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
</style>
