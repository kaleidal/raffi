<script lang="ts">
    import {
        listItemsMap,
        selectedItem,
        loadingItem,
        dragState,
    } from "../listsState";
    import { selectItem } from "../dataLoader";
    import {
        handleDragStart,
        handleDragOver,
        handleDrop,
    } from "../dragDropLogic";
    import { fade } from "svelte/transition";

    export let listId: string;

    $: items = $listItemsMap[listId] || [];
</script>

{#if items.length > 0}
    <div class="grid grid-cols-4 gap-[20px]">
        {#each items as item (item.imdb_id)}
            <button
                class="flex flex-col gap-[10px] w-full aspect-[2/3] transition-opacity duration-300 group cursor-pointer relative
                {$selectedItem?.imdb_id === item.imdb_id
                    ? 'opacity-60'
                    : 'hover:opacity-80'} 
                {$dragState.draggedItem?.imdb_id === item.imdb_id
                    ? 'opacity-30'
                    : ''}"
                on:click={() => selectItem(item, listId)}
                draggable="true"
                on:dragstart={(e) => handleDragStart(e, item, listId)}
                on:dragover={handleDragOver}
                on:drop={(e) => handleDrop(e, item, listId)}
            >
                <img
                    src={item.poster}
                    alt={item.name}
                    class="w-full h-full object-cover rounded-[12px] bg-[#1a1a1a]"
                />
                {#if $selectedItem?.imdb_id === item.imdb_id}
                    <div
                        class="absolute inset-0 bg-black/20 rounded-[12px]"
                    ></div>
                {/if}

                {#if $loadingItem === item.imdb_id}
                    <div
                        class="absolute inset-0 flex items-center justify-center bg-black/40 rounded-[12px] backdrop-blur-[2px]"
                        transition:fade={{ duration: 200 }}
                    >
                        <div
                            class="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin"
                        ></div>
                    </div>
                {/if}
            </button>
        {/each}
    </div>
{:else}
    <div class="text-white/30 text-[16px] font-poppins italic py-4">
        No items in this list
    </div>
{/if}
