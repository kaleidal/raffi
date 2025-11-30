import { deleteList, removeFromList as dbRemoveFromList, updateList, updateListItemPosition } from "../../lib/db/db";
import { loadLists, loadListItems, selectItem } from "./dataLoader";
import { lists, selectedListId, selectedItem, editingState, listItemsMap } from "./listsState";
import { get } from "svelte/store";
import type { List } from "./types";

export async function handleDeleteList(listId: string) {
    if (!confirm("Are you sure you want to delete this list?")) return;
    try {
        await deleteList(listId);
        await loadLists();

        const currentSelectedListId = get(selectedListId);
        if (currentSelectedListId === listId) {
            selectedItem.set(null);
            selectedListId.set(null);
        }
    } catch (e) {
        console.error("Failed to delete list", e);
    }
}

export async function handleRemoveFromList() {
    const currentSelectedItem = get(selectedItem);
    const currentSelectedListId = get(selectedListId);

    if (!currentSelectedItem || !currentSelectedListId) return;
    if (!confirm("Remove this item from the list?")) return;

    try {
        await dbRemoveFromList(currentSelectedListId, currentSelectedItem.imdb_id);
        await loadListItems(currentSelectedListId);

        const currentListItemsMap = get(listItemsMap);
        const currentListItems = currentListItemsMap[currentSelectedListId];

        if (currentListItems && currentListItems.length > 0) {
            selectItem(currentListItems[0], currentSelectedListId);
        } else {
            selectedItem.set(null);
        }
    } catch (e) {
        console.error("Failed to remove item", e);
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
    try {
        await updateList(currentEditingState.listId, { name: currentEditingState.name });
        await loadLists();
        editingState.set({ listId: null, name: "" });
    } catch (e) {
        console.error("Failed to rename list", e);
    }
}

export async function moveList(index: number, direction: "up" | "down") {
    const currentLists = get(lists);

    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === currentLists.length - 1) return;

    const newIndex = direction === "up" ? index - 1 : index + 1;
    const listA = currentLists[index];
    const listB = currentLists[newIndex];

    // Swap positions
    const posA = listA.position;
    const posB = listB.position;

    try {
        await updateList(listA.list_id, { position: posB });
        await updateList(listB.list_id, { position: posA });
        await loadLists();
    } catch (e) {
        console.error("Failed to move list", e);
    }
}
