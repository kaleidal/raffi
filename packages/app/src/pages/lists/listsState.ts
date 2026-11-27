import { writable } from "svelte/store";
import type { List, ExtendedListItem, DragState, EditingState } from "./types";

export const lists = writable<List[]>([]);
export const listItemsMap = writable<Record<string, ExtendedListItem[]>>({});
export const selectedItem = writable<ExtendedListItem | null>(null);
export const selectedListId = writable<string | null>(null);
export const loadingItem = writable<string | null>(null);

export const editingState = writable<EditingState>({
    listId: null,
    name: "",
});


export const dragState = writable<DragState>({
    draggedItem: null,
    draggedFromListId: null,
});

export const loaded = writable<boolean>(false);
