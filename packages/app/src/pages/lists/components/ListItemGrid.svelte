<script lang="ts">
    import { fade } from "svelte/transition";
    import { listItemsMap, selectedItem, loadingItem, dragState } from "../listsState";
    import { selectItem } from "../dataLoader";
    import { handleDragStart, handleDragOver, handleDrop } from "../dragDropLogic";

    export let listId: string;

    $: items = $listItemsMap[listId] || [];
</script>

<div class="list-item-grid grid gap-[clamp(14px,1.2vw,22px)] pb-[clamp(32px,4vw,64px)]">
    {#each items as item (item.imdb_id)}
        {@const selected = $selectedItem?.imdb_id === item.imdb_id}
        <button
            class="relative aspect-[2/3] w-full cursor-pointer rounded-[16px] transition-[translate,opacity,box-shadow] duration-200 hover:-translate-y-1 {selected
                ? 'ring-[3px] ring-accent ring-offset-[3px] ring-offset-canvas'
                : ''} {$dragState.draggedItem?.imdb_id === item.imdb_id ? 'opacity-30' : ''}"
            aria-label={item.name}
            aria-pressed={selected}
            on:click={() => selectItem(item, listId)}
            draggable="true"
            on:dragstart={(e) => handleDragStart(e, item, listId)}
            on:dragover={handleDragOver}
            on:drop={(e) => handleDrop(e, item, listId)}
        >
            <img src={item.poster} alt="" class="h-full w-full rounded-[16px] bg-surface object-cover" width="300" height="450" loading="lazy" />

            {#if $loadingItem === item.imdb_id}
                <div
                    class="absolute inset-0 flex items-center justify-center rounded-[16px] bg-canvas/40 backdrop-blur-[2px]"
                    transition:fade={{ duration: 200 }}
                >
                    <div class="h-8 w-8 animate-spin rounded-full border-4 border-ink/20 border-t-ink"></div>
                </div>
            {/if}
        </button>
    {/each}
</div>

<style>
    .list-item-grid {
        grid-template-columns: repeat(auto-fill, minmax(clamp(120px, 9.5vw, 190px), 1fr));
    }
</style>
