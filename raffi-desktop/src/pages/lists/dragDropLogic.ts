import { updateListItemPosition } from "../../lib/db/db";
import { listItemsMap, dragState } from "./listsState";
import { loadListItems } from "./dataLoader";
import { get } from "svelte/store";
import type { ExtendedListItem } from "./types";
import { trackEvent } from "../../lib/analytics";


export function handleDragStart(event: DragEvent, item: ExtendedListItem, listId: string) {
    dragState.set({
        draggedItem: item,
        draggedFromListId: listId,
    });

    trackEvent("list_item_drag_started", {
        content_type: item.type,
    });

    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
    }
}

export function handleDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
    }
}

export async function handleDrop(
    event: DragEvent,
    targetItem: ExtendedListItem,
    targetListId: string,
) {
    event.preventDefault();

    const currentDragState = get(dragState);
    const { draggedItem, draggedFromListId } = currentDragState;

    if (!draggedItem || !draggedFromListId) return;
    if (draggedFromListId !== targetListId) return; // Only allow reordering within same list for now
    if (draggedItem.imdb_id === targetItem.imdb_id) return;

    const currentListItemsMap = get(listItemsMap);
    const items = currentListItemsMap[targetListId];

    const oldIndex = items.findIndex(
        (i) => i.imdb_id === draggedItem.imdb_id,
    );
    const newIndex = items.findIndex(
        (i) => i.imdb_id === targetItem.imdb_id,
    );

    if (oldIndex === -1 || newIndex === -1) return;

    trackEvent("list_item_reordered", {
        from_index: oldIndex,
        to_index: newIndex,
    });

    // Reorder array locally
    const newItems = [...items];
    newItems.splice(oldIndex, 1);
    newItems.splice(newIndex, 0, draggedItem);

    listItemsMap.update(map => ({
        ...map,
        [targetListId]: newItems
    }));

    // Update positions in DB
    try {
        const updates = newItems.map((item, index) =>
            updateListItemPosition(targetListId, item.imdb_id, index + 1),
        );
        await Promise.all(updates);
    } catch (e) {
        console.error("Failed to update item positions", e);
        trackEvent("list_item_reorder_failed", {
            error_name: e instanceof Error ? e.name : "unknown",
        });
        await loadListItems(targetListId); // Revert on error
    }

    dragState.set({
        draggedItem: null,
        draggedFromListId: null,
    });
}

