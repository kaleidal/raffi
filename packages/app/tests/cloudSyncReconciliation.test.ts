import { describe, expect, test } from "bun:test";
import { reconcileRemoteState } from "../src/lib/db/reconciliation";
import type { CloudSyncState, LibraryItem, RemoteState } from "../src/lib/db/types";

const iso = (timestamp: number) => new Date(timestamp).toISOString();

const emptyRemoteState = (): RemoteState => ({
    addons: [],
    library: [],
    lists: [],
    listItems: [],
    userMeta: null,
    tombstones: [],
});

const emptySyncState = (): CloudSyncState => ({
    dirty: { addons: {}, library: {}, lists: {}, listItems: {}, userMeta: {} },
    tombstones: { addons: {}, library: {}, lists: {}, listItems: {}, userMeta: {} },
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    reachability: "unknown",
});

const series = (updatedAt: number, watched: boolean, completedAt: string | null): LibraryItem => ({
    user_id: "user",
    imdb_id: "tt-series",
    progress: {
        "1:1": { time: watched ? 1800 : 0, duration: 1800, watched, updatedAt },
    },
    last_watched: iso(updatedAt),
    completed_at: completedAt,
    type: "series",
    shown: true,
    updated_at: iso(updatedAt),
});

describe("cloud sync reconciliation", () => {
    test("a newer unwatched series update clears stale completion", () => {
        const local = emptyRemoteState();
        local.library = [series(2_000, false, null)];
        const remote = emptyRemoteState();
        remote.library = [series(1_000, true, iso(1_000))];
        const syncState = emptySyncState();
        syncState.dirty.library["tt-series"] = 2_000;

        const result = reconcileRemoteState(local, remote, syncState);

        expect(result.state.library[0]?.completed_at).toBeNull();
        expect(result.state.library[0]?.progress["1:1"]).toMatchObject({ watched: false, updatedAt: 2_000 });
    });

    test("a newer remote tombstone removes a stale dirty record", () => {
        const local = emptyRemoteState();
        local.library = [series(2_000, false, null)];
        const remote = emptyRemoteState();
        remote.tombstones = [{ section: "library", key: "tt-series", updated_at: iso(3_000) }];
        const syncState = emptySyncState();
        syncState.dirty.library["tt-series"] = 2_000;

        const result = reconcileRemoteState(local, remote, syncState);

        expect(result.state.library).toEqual([]);
        expect(result.syncState.dirty.library).toEqual({});
    });

    test("a newer local recreation survives an older remote tombstone", () => {
        const local = emptyRemoteState();
        local.library = [series(4_000, false, null)];
        const remote = emptyRemoteState();
        remote.tombstones = [{ section: "library", key: "tt-series", updated_at: iso(3_000) }];
        const syncState = emptySyncState();
        syncState.dirty.library["tt-series"] = 4_000;

        const result = reconcileRemoteState(local, remote, syncState);

        expect(result.state.library).toHaveLength(1);
        expect(result.syncState.dirty.library["tt-series"]).toBe(4_000);
    });

    test("a newer remote edit beats an older dirty local edit", () => {
        const local = emptyRemoteState();
        local.lists = [{
            user_id: "user",
            list_id: "favorites",
            name: "Old local name",
            position: 1,
            created_at: iso(500),
            updated_at: iso(1_000),
        }];
        const remote = emptyRemoteState();
        remote.lists = [{
            ...local.lists[0]!,
            name: "Newest name",
            updated_at: iso(2_000),
        }];
        const syncState = emptySyncState();
        syncState.dirty.lists.favorites = 1_000;

        const result = reconcileRemoteState(local, remote, syncState);

        expect(result.state.lists[0]?.name).toBe("Newest name");
        expect(result.syncState.dirty.lists).toEqual({});
    });
});
