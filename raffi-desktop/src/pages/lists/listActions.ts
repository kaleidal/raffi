import { deleteList, removeFromList as dbRemoveFromList, updateList, updateListItemPosition } from "../../lib/db/db";
import { loadLists, loadListItems, selectItem } from "./dataLoader";
import { lists, selectedListId, selectedItem, editingState, listItemsMap } from "./listsState";
import { get } from "svelte/store";
import type { List } from "./types";
import { trackEvent } from "../../lib/analytics";


export async function handleDeleteList(listId: string) {
    if (!confirm("Are you sure you want to delete this list?")) return;
    const beforeCount = get(lists).length;
    try {
        await deleteList(listId);
        await loadLists();

        const currentSelectedListId = get(selectedListId);
        if (currentSelectedListId === listId) {
            selectedItem.set(null);
            selectedListId.set(null);
        }
        trackEvent("list_deleted", { list_count_before: beforeCount });
    } catch (e) {
        console.error("Failed to delete list", e);
        trackEvent("list_delete_failed", {
            error_name: e instanceof Error ? e.name : "unknown",
        });
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
        trackEvent("list_item_removed_from_list", { list_count: get(lists).length });
    } catch (e) {
        console.error("Failed to remove item", e);
        trackEvent("list_item_remove_failed", {
            error_name: e instanceof Error ? e.name : "unknown",
        });
    }
}

export function startEditing(list: List) {
    editingState.set({
        listId: list.list_id,
        name: list.name,
    });
    trackEvent("list_rename_started");
}

export async function saveListName() {
    const currentEditingState = get(editingState);
    if (!currentEditingState.listId) return;
    try {
        await updateList(currentEditingState.listId, { name: currentEditingState.name });
        await loadLists();
        editingState.set({ listId: null, name: "" });
        trackEvent("list_renamed", { list_count: get(lists).length });
    } catch (e) {
        console.error("Failed to rename list", e);
        trackEvent("list_rename_failed", {
            error_name: e instanceof Error ? e.name : "unknown",
        });
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
        trackEvent("list_reordered", { direction });
    } catch (e) {
        console.error("Failed to move list", e);
        trackEvent("list_reorder_failed", {
            error_name: e instanceof Error ? e.name : "unknown",
        });
    }
}

