import { createList, deleteList, removeFromList as dbRemoveFromList, updateList } from "../../lib/db/db";
import { loadLists, loadListItems, selectItem, selectList } from "./dataLoader";
import { lists, selectedListId, selectedItem, editingState, listItemsMap } from "./listsState";
import { get } from "svelte/store";
import type { List } from "./types";
import { confirmDialog } from "../../lib/shell/systemDialogs";

export async function createNewList(name: string) {
    const list = await createList(name);
    await loadLists();
    selectList(list.list_id);
}

export async function handleDeleteList(listId: string) {
    if (!(await confirmDialog("Are you sure you want to delete this list?", "Delete list"))) return;
    await deleteList(listId);
    await loadLists();

    if (get(selectedListId) === listId) {
        const next = get(lists)[0];
        if (next) selectList(next.list_id);
        else {
            selectedListId.set(null);
            selectedItem.set(null);
        }
    }
}

export async function handleRemoveFromList() {
    const currentSelectedItem = get(selectedItem);
    const currentSelectedListId = get(selectedListId);

    if (!currentSelectedItem || !currentSelectedListId) return;
    if (!(await confirmDialog("Remove this item from the list?", "Remove item"))) return;

    await dbRemoveFromList(currentSelectedListId, currentSelectedItem.imdb_id);
    await loadListItems(currentSelectedListId);

    const remaining = get(listItemsMap)[currentSelectedListId];
    if (remaining && remaining.length > 0) {
        selectItem(remaining[0], currentSelectedListId);
    } else {
        selectedItem.set(null);
    }
}

export function startEditing(list: List) {
    editingState.set({
        listId: list.list_id,
        name: list.name,
    });
}

export async function saveListName() {
    const currentEditingState = get(editingState);
    if (!currentEditingState.listId) return;
    if (currentEditingState.name.trim()) {
        await updateList(currentEditingState.listId, { name: currentEditingState.name.trim() });
        await loadLists();
    }
    editingState.set({ listId: null, name: "" });
}

export async function reorderLists(fromIndex: number, toIndex: number) {
    const current = get(lists);
    if (fromIndex === toIndex || !current[fromIndex] || !current[toIndex]) return;

    const reordered = [...current];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    lists.set(reordered);

    await Promise.all(
        reordered
            .map((list, index) => ({ list, position: index + 1 }))
            .filter(({ list, position }) => list.position !== position)
            .map(({ list, position }) => updateList(list.list_id, { position })),
    );
    await loadLists();
}
