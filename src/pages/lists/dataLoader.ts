import { getListsWithItems, getListItems, updateListItemPoster } from "../../lib/db/db";
import { getCachedMetaData } from "../../lib/library/metaCache";
import { lists, listItemsMap, selectedItem, selectedListId, loadingItem, playerState } from "./listsState";
import { get } from "svelte/store";
import type { List, ExtendedListItem } from "./types";

export async function loadLists() {
    try {
        const listsWithItems = await getListsWithItems();
        lists.set(listsWithItems as List[]);

        // Load metadata for all items
        for (const list of listsWithItems) {
            await loadListItems(list.list_id, list.list_items);
        }

        const currentLists = get(lists);
        const currentSelectedItem = get(selectedItem);
        const currentListItemsMap = get(listItemsMap);

        if (!currentSelectedItem && currentLists.length > 0) {
            const firstListId = currentLists[0].list_id;
            if (
                currentListItemsMap[firstListId] &&
                currentListItemsMap[firstListId].length > 0
            ) {
                selectItem(currentListItemsMap[firstListId][0], firstListId);
            }
        }
    } catch (e) {
        console.error("Failed to load lists", e);
    }
}

export async function loadListItems(listId: string, items?: any[]) {
    try {
        if (!items) {
            items = await getListItems(listId);
        }

        const metaPromises = items!.map(async (item: any) => {
            if (item.poster) {
                return {
                    poster: item.poster,
                    imdb_id: item.imdb_id,
                    type: item.type,
                    list_id: listId,
                    db_item: item,
                    _partial: true,
                    position: item.position,
                } as ExtendedListItem;
            }

            try {
                const data = await getCachedMetaData(
                    item.imdb_id,
                    item.type,
                );
                if (data && data.meta) {
                    if (!item.poster && data.meta.poster) {
                        try {
                            await updateListItemPoster(
                                listId,
                                item.imdb_id,
                                data.meta.poster,
                            );

                            item.poster = data.meta.poster;
                        } catch (e) {
                            console.error("Failed to backfill poster", e);
                        }
                    }
                    return { ...data.meta, list_id: listId, db_item: item, position: item.position } as ExtendedListItem;
                }
            } catch (e) {
                console.error(`Failed to load meta for ${item.imdb_id}`, e);
            }
            return null;
        });

        const metas = await Promise.all(metaPromises);

        listItemsMap.update(map => ({
            ...map,
            [listId]: metas
                .filter((m): m is NonNullable<typeof m> => !!m)
                .map((m) => ({
                    ...m,
                    poster: m.db_item.poster || m.poster,
                    position: m.db_item.position,
                }))
                .sort((a, b) => a.position - b.position)
        }));
    } catch (e) {
        console.error("Failed to load list items", e);
    }
}

export async function selectItem(item: ExtendedListItem, listId: string) {
    const currentLoadingItem = get(loadingItem);
    if (currentLoadingItem === item.imdb_id) return;

    selectedListId.set(listId);

    playerState.update(s => ({ ...s, isPaused: false, isMuted: true }));

    if (item._partial) {
        loadingItem.set(item.imdb_id);
        try {
            const data = await getCachedMetaData(item.imdb_id, item.type);
            if (data && data.meta) {
                const fullItem = {
                    ...data.meta,
                    list_id: listId,
                    db_item: item.db_item,
                    position: item.position,
                } as ExtendedListItem;

                selectedItem.set(fullItem);

                listItemsMap.update(map => {
                    const items = map[listId];
                    if (!items) return map;

                    const idx = items.findIndex(
                        (i) => i.imdb_id === item.imdb_id,
                    );
                    if (idx !== -1) {
                        const newItems = [...items];
                        newItems[idx] = {
                            ...fullItem,
                            poster: item.poster,
                            position: item.position,
                        };
                        return { ...map, [listId]: newItems };
                    }
                    return map;
                });
            }
        } catch (e) {
            console.error("Failed to fetch full meta for selected item", e);
            selectedItem.set(item);
        } finally {
            loadingItem.set(null);
        }
    } else {
        selectedItem.set(item);
    }
}
