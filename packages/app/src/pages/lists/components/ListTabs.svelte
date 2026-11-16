<script lang="ts">
    import { tick } from "svelte";
    import { Dices, Pencil, Plus, Trash2 } from "@lucide/svelte";
    import { editingState, listItemsMap, lists, selectedListId } from "../listsState";
    import { createNewList, handleDeleteList, reorderLists, saveListName, startEditing } from "../listActions";
    import { selectItem, selectList } from "../dataLoader";

    let creating = $state(false);
    let newName = $state("");
    let draggedIndex = $state<number | null>(null);

    const current = $derived($lists.find((list) => list.list_id === $selectedListId) ?? null);
    const currentItems = $derived(current ? ($listItemsMap[current.list_id] ?? []) : []);

    function focusOnMount(node: HTMLInputElement) {
        void tick().then(() => node.select());
    }

    async function submitNew(event: SubmitEvent) {
        event.preventDefault();
        const name = newName.trim();
        creating = false;
        newName = "";
        if (name) await createNewList(name);
    }

    function pickRandom() {
        if (!current || !currentItems.length) return;
        void selectItem(currentItems[Math.floor(Math.random() * currentItems.length)], current.list_id);
    }

    function drop(index: number) {
        if (draggedIndex !== null) void reorderLists(draggedIndex, index);
        draggedIndex = null;
    }

    const tab = "shrink-0 cursor-pointer rounded-full px-5 py-2.5 text-[clamp(15px,1vw,18px)] font-medium transition-colors duration-200";
    const action = "cursor-pointer rounded-full p-2.5 text-ink/55 transition-colors hover:bg-ink/10 disabled:cursor-default disabled:opacity-35";
</script>

<div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
    <div class="flex min-w-0 flex-wrap items-center gap-2.5">
        {#each $lists as list, index (list.list_id)}
            {#if $editingState.listId === list.list_id}
                <form onsubmit={(event) => (event.preventDefault(), saveListName())}>
                    <input
                        use:focusOnMount
                        bind:value={$editingState.name}
                        maxlength="64"
                        class="w-48 rounded-full bg-ink/12 px-5 py-2.5 text-[clamp(15px,1vw,18px)] font-medium text-ink outline-none"
                        onblur={saveListName}
                        onkeydown={(event) => event.key === "Escape" && editingState.set({ listId: null, name: "" })}
                    />
                </form>
            {:else}
                <button
                    class="{tab} {list.list_id === $selectedListId
                        ? 'bg-accent text-on-accent'
                        : 'bg-ink/8 text-ink/80 hover:bg-ink/14 hover:text-ink'} {draggedIndex === index ? 'opacity-40' : ''}"
                    draggable="true"
                    ondragstart={() => (draggedIndex = index)}
                    ondragend={() => (draggedIndex = null)}
                    ondragover={(event) => event.preventDefault()}
                    ondrop={() => drop(index)}
                    onclick={() => selectList(list.list_id)}
                    ondblclick={() => startEditing(list)}
                >
                    {list.name}
                </button>
            {/if}
        {/each}

        {#if creating}
            <form onsubmit={submitNew}>
                <input
                    use:focusOnMount
                    bind:value={newName}
                    placeholder="List name"
                    maxlength="64"
                    class="w-48 rounded-full bg-ink/12 px-5 py-2.5 text-[clamp(15px,1vw,18px)] font-medium text-ink outline-none placeholder:text-ink/40"
                    onblur={() => (creating = false)}
                    onkeydown={(event) => event.key === "Escape" && (creating = false)}
                />
            </form>
        {:else}
            <button class="{tab} flex items-center gap-2 text-ink/55 hover:bg-ink/8 hover:text-ink" onclick={() => (creating = true)}>
                <Plus size={18} strokeWidth={2.2} />
                New list
            </button>
        {/if}
    </div>

    {#if current}
        <div class="flex items-center gap-1">
            <button class="{action} hover:text-ink" aria-label="Pick something at random" title="Pick something at random" disabled={!currentItems.length} onclick={pickRandom}>
                <Dices size={20} strokeWidth={2} />
            </button>
            <button class="{action} hover:text-ink" aria-label="Rename list" title="Rename list" onclick={() => startEditing(current)}>
                <Pencil size={19} strokeWidth={2} />
            </button>
            <button class="{action} hover:text-danger" aria-label="Delete list" title="Delete list" onclick={() => handleDeleteList(current.list_id)}>
                <Trash2 size={19} strokeWidth={2} />
            </button>
        </div>
    {/if}
</div>
