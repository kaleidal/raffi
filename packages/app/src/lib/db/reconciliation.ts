import type {
    Addon,
    CloudSyncState,
    LibraryItem,
    List,
    ListItem,
    RemoteState,
    SyncSection,
    SyncTombstone,
    UserMeta,
} from "./types";

const EPOCH = "1970-01-01T00:00:00.000Z";

const toTimestamp = (value: string | null | undefined) => {
    if (!value) return 0;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const toIsoTimestamp = (value: number) => new Date(Math.max(0, value)).toISOString();

const isPlainObject = (value: unknown): value is Record<string, any> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeProgressEntry = (value: any) => {
    const time = Number(value?.time || 0);
    const duration = Number(value?.duration || 0);
    const updatedAt = Number(value?.updatedAt || 0);
    return {
        time: Number.isFinite(time) ? Math.max(0, time) : 0,
        duration: Number.isFinite(duration) ? Math.max(0, duration) : 0,
        watched: Boolean(value?.watched),
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
    };
};

const compareProgressEntries = (left: any, right: any) => {
    const leftEntry = normalizeProgressEntry(left);
    const rightEntry = normalizeProgressEntry(right);
    if (leftEntry.updatedAt !== rightEntry.updatedAt) {
        return leftEntry.updatedAt > rightEntry.updatedAt ? 1 : -1;
    }
    if (leftEntry.watched !== rightEntry.watched) {
        return leftEntry.watched ? 1 : -1;
    }
    const leftRatio = leftEntry.duration > 0 ? leftEntry.time / leftEntry.duration : 0;
    const rightRatio = rightEntry.duration > 0 ? rightEntry.time / rightEntry.duration : 0;
    if (Math.abs(leftRatio - rightRatio) > 0.005) {
        return leftRatio > rightRatio ? 1 : -1;
    }
    if (Math.abs(leftEntry.time - rightEntry.time) > 1) {
        return leftEntry.time > rightEntry.time ? 1 : -1;
    }
    return 0;
};

export const mergeProgressEntry = (left: any, right: any) => {
    if (!isPlainObject(left)) return right;
    if (!isPlainObject(right)) return left;
    return compareProgressEntries(left, right) >= 0 ? { ...right, ...left } : { ...left, ...right };
};

const isEpisodeProgressMap = (value: any) =>
    isPlainObject(value) && Object.values(value).some((entry) => isPlainObject(entry) && ("time" in entry || "watched" in entry));

const mergeLibraryProgress = (left: any, right: any, type: string) => {
    if (type === "series" && (isEpisodeProgressMap(left) || isEpisodeProgressMap(right))) {
        const leftMap = isPlainObject(left) ? left : {};
        const rightMap = isPlainObject(right) ? right : {};
        const merged: Record<string, any> = {};
        for (const key of new Set([...Object.keys(leftMap), ...Object.keys(rightMap)])) {
            merged[key] = mergeProgressEntry(leftMap[key], rightMap[key]);
        }
        return merged;
    }
    return mergeProgressEntry(left, right);
};

const newestProgressTimestamp = (progress: any, type: string) => {
    if (type === "series" && isEpisodeProgressMap(progress)) {
        return Math.max(0, ...Object.values(progress).map((entry) => normalizeProgressEntry(entry).updatedAt));
    }
    return normalizeProgressEntry(progress).updatedAt;
};

const fallbackTimestamp = (section: SyncSection, record: any) => {
    if (section === "addons") return record.added_at;
    if (section === "library") {
        return toIsoTimestamp(Math.max(
            toTimestamp(record.last_watched),
            newestProgressTimestamp(record.progress, record.type || "movie"),
        ));
    }
    if (section === "lists") return record.created_at;
    if (section === "userMeta") return record.updated_at;
    return EPOCH;
};

const normalizeRecord = <T extends { updated_at?: string }>(section: SyncSection, record: T): T & { updated_at: string } => ({
    ...record,
    updated_at: record.updated_at || fallbackTimestamp(section, record) || EPOCH,
});

export const normalizeRemoteState = (state: Partial<RemoteState>): RemoteState => ({
    addons: (state.addons || []).map((record) => normalizeRecord("addons", record)),
    library: (state.library || []).map((record) => normalizeRecord("library", record)),
    lists: (state.lists || []).map((record) => normalizeRecord("lists", record)),
    listItems: (state.listItems || []).map((record) => normalizeRecord("listItems", record)),
    userMeta: state.userMeta ? normalizeRecord("userMeta", state.userMeta) : null,
    tombstones: Array.isArray(state.tombstones) ? state.tombstones : [],
});

const cloneSyncState = (state: CloudSyncState): CloudSyncState => ({
    ...state,
    dirty: {
        addons: { ...state.dirty.addons },
        library: { ...state.dirty.library },
        lists: { ...state.dirty.lists },
        listItems: { ...state.dirty.listItems },
        userMeta: { ...state.dirty.userMeta },
    },
    tombstones: {
        addons: { ...state.tombstones.addons },
        library: { ...state.tombstones.library },
        lists: { ...state.tombstones.lists },
        listItems: { ...state.tombstones.listItems },
        userMeta: { ...state.tombstones.userMeta },
    },
});

type ReconcileOperation<T> = {
    kind: "record" | "delete";
    source: "local" | "remote";
    timestamp: number;
    record?: T;
};

const operationPriority = (operation: ReconcileOperation<unknown>) => {
    if (operation.kind === "delete") return operation.source === "remote" ? 4 : 3;
    return operation.source === "remote" ? 2 : 1;
};

const chooseNewestOperation = <T>(operations: ReconcileOperation<T>[]) =>
    operations.reduce((winner, operation) => {
        if (operation.timestamp !== winner.timestamp) {
            return operation.timestamp > winner.timestamp ? operation : winner;
        }
        return operationPriority(operation) > operationPriority(winner) ? operation : winner;
    });

const tombstonesForSection = (tombstones: SyncTombstone[], section: SyncSection) =>
    new Map(tombstones.filter((item) => item.section === section).map((item) => [item.key, item]));

const mergeLibraryRecords = (winner: LibraryItem, other: LibraryItem | undefined) => {
    if (!other) return winner;
    return {
        ...winner,
        progress: mergeLibraryProgress(winner.progress, other.progress, winner.type || other.type || "movie"),
    };
};

const reconcileSection = <T extends { updated_at: string }>(options: {
    section: SyncSection;
    localItems: T[];
    remoteItems: T[];
    remoteTombstones: SyncTombstone[];
    syncState: CloudSyncState;
    keyOf: (item: T) => string;
    mergeRecords?: (winner: T, other: T | undefined) => T;
}) => {
    const { section, localItems, remoteItems, remoteTombstones, syncState, keyOf } = options;
    const localByKey = new Map(localItems.map((item) => [keyOf(item), normalizeRecord(section, item)]));
    const remoteByKey = new Map(remoteItems.map((item) => [keyOf(item), normalizeRecord(section, item)]));
    const remoteDeletes = tombstonesForSection(remoteTombstones, section);
    const keys = new Set([
        ...remoteByKey.keys(),
        ...remoteDeletes.keys(),
        ...Object.keys(syncState.dirty[section]),
        ...Object.keys(syncState.tombstones[section]),
    ]);
    const result: T[] = [];

    for (const key of keys) {
        const localRecord = syncState.dirty[section][key] ? localByKey.get(key) : undefined;
        const remoteRecord = remoteByKey.get(key);
        const localRecordTimestamp = localRecord
            ? Math.max(toTimestamp(localRecord.updated_at), syncState.dirty[section][key] || 0)
            : 0;
        const localDeleteTimestamp = syncState.tombstones[section][key] || 0;
        const remoteDeleteTimestamp = toTimestamp(remoteDeletes.get(key)?.updated_at);
        const operations: ReconcileOperation<T>[] = [];
        if (localRecord) operations.push({ kind: "record", source: "local", timestamp: localRecordTimestamp, record: localRecord });
        if (remoteRecord) operations.push({ kind: "record", source: "remote", timestamp: toTimestamp(remoteRecord.updated_at), record: remoteRecord });
        if (localDeleteTimestamp) operations.push({ kind: "delete", source: "local", timestamp: localDeleteTimestamp });
        if (remoteDeleteTimestamp) operations.push({ kind: "delete", source: "remote", timestamp: remoteDeleteTimestamp });
        if (operations.length === 0) {
            delete syncState.dirty[section][key];
            continue;
        }

        const winner = chooseNewestOperation(operations);
        if (winner.source === "remote") {
            delete syncState.dirty[section][key];
            delete syncState.tombstones[section][key];
        }
        if (winner.kind === "delete" || !winner.record) continue;

        const otherRecord = winner.source === "local" ? remoteRecord : localRecord;
        result.push((options.mergeRecords?.(winner.record, otherRecord) || winner.record) as T);
    }
    return result;
};

export const reconcileRemoteState = (
    localInput: RemoteState,
    remoteInput: RemoteState,
    currentSyncState: CloudSyncState,
) => {
    const local = normalizeRemoteState(localInput);
    const remote = normalizeRemoteState(remoteInput);
    const syncState = cloneSyncState(currentSyncState);
    const addons = reconcileSection<Addon>({
        section: "addons",
        localItems: local.addons,
        remoteItems: remote.addons,
        remoteTombstones: remote.tombstones,
        syncState,
        keyOf: (item) => item.transport_url,
    });
    const library = reconcileSection<LibraryItem>({
        section: "library",
        localItems: local.library,
        remoteItems: remote.library,
        remoteTombstones: remote.tombstones,
        syncState,
        keyOf: (item) => item.imdb_id,
        mergeRecords: mergeLibraryRecords,
    });
    const lists = reconcileSection<List>({
        section: "lists",
        localItems: local.lists,
        remoteItems: remote.lists,
        remoteTombstones: remote.tombstones,
        syncState,
        keyOf: (item) => item.list_id,
    });
    const listItems = reconcileSection<ListItem>({
        section: "listItems",
        localItems: local.listItems,
        remoteItems: remote.listItems,
        remoteTombstones: remote.tombstones,
        syncState,
        keyOf: (item) => `${item.list_id}::${item.imdb_id}`,
    }).filter((item) => lists.some((list) => list.list_id === item.list_id));
    const userMetaItems = reconcileSection<UserMeta>({
        section: "userMeta",
        localItems: local.userMeta ? [local.userMeta as UserMeta & { updated_at: string }] : [],
        remoteItems: remote.userMeta ? [remote.userMeta as UserMeta & { updated_at: string }] : [],
        remoteTombstones: remote.tombstones,
        syncState,
        keyOf: () => "settings",
    });

    return {
        state: {
            addons,
            library,
            lists,
            listItems,
            userMeta: userMetaItems[0] || null,
            tombstones: [],
        } satisfies RemoteState,
        syncState,
    };
};
