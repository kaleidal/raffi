import { HttpError, optionalString } from "./http";
import type { Addon, JsonValue, LibraryItem, List, ListItem, SyncPayload, SyncSection } from "./types";
import type { SyncD1Database } from "./d1Session";
import { applySyncState } from "./db";

type AddonRow = {
  user_id: string;
  added_at: string;
  transport_url: string;
  manifest: string;
  flags: string | null;
  addon_id: string;
  position: number | null;
  updated_at: string;
};

type LibraryRow = {
  user_id: string;
  imdb_id: string;
  progress: string;
  last_watched: string;
  completed_at: string | null;
  type: string;
  shown: number;
  poster: string | null;
  updated_at: string;
};

type ListRow = {
  user_id: string;
  list_id: string;
  created_at: string;
  name: string;
  position: number;
  updated_at: string;
};

const nowIso = () => new Date().toISOString();

const parseStoredJson = (value: string | null | undefined, fallback: JsonValue): JsonValue => {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return fallback;
  }
};

const toJsonValue = (value: unknown, fallback: JsonValue = null): JsonValue =>
  value === undefined ? fallback : value as JsonValue;

const storedJson = (value: unknown, fallback: unknown = null) =>
  JSON.stringify(value === undefined ? fallback : value);

const toInteger = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};

const toAddon = (row: AddonRow): Addon => ({
  user_id: row.user_id,
  added_at: row.added_at,
  transport_url: row.transport_url,
  manifest: parseStoredJson(row.manifest, {}),
  flags: parseStoredJson(row.flags, null),
  addon_id: row.addon_id,
  position: row.position ?? undefined,
  updated_at: row.updated_at,
});

const toLibraryItem = (row: LibraryRow): LibraryItem => ({
  user_id: row.user_id,
  imdb_id: row.imdb_id,
  progress: parseStoredJson(row.progress, null),
  last_watched: row.last_watched,
  completed_at: row.completed_at,
  type: row.type,
  shown: row.shown !== 0,
  poster: row.poster ?? undefined,
  updated_at: row.updated_at,
});

const emptySyncPayload = (): SyncPayload => ({
  addons: [],
  library: [],
  lists: [],
  listItems: [],
  deletes: [],
});

const applyRecord = async (
  db: SyncD1Database,
  userId: string,
  section: "addons" | "library" | "lists" | "listItems",
  record: Addon | LibraryItem | List | ListItem,
) => {
  const payload = emptySyncPayload();
  if (section === "addons") payload.addons.push(record as Addon);
  if (section === "library") payload.library.push(record as LibraryItem);
  if (section === "lists") payload.lists.push(record as List);
  if (section === "listItems") payload.listItems.push(record as ListItem);
  await applySyncState(db, userId, payload, false);
};

const applyDeletion = async (db: SyncD1Database, userId: string, section: SyncSection, key: string) => {
  const payload = emptySyncPayload();
  payload.deletes.push({ section, key, updated_at: nowIso() });
  await applySyncState(db, userId, payload, false);
};

const requireString = (value: unknown, field: string) => {
  const text = optionalString(value);
  if (!text) throw new HttpError(400, `Missing ${field}`, "invalid_request");
  return text;
};

const getListForUser = async (db: SyncD1Database, userId: string, listId: string) => {
  return db.prepare("SELECT * FROM lists WHERE user_id = ? AND list_id = ?")
    .bind(userId, listId)
    .first<ListRow>();
};

export const addAddon = async (db: SyncD1Database, userId: string, addon: Partial<Addon>) => {
  const transportUrl = requireString(addon.transport_url, "addon transport_url");
  const existing = await db.prepare("SELECT * FROM addons WHERE user_id = ? AND transport_url = ?")
    .bind(userId, transportUrl)
    .first<AddonRow>();
  if (existing) return toAddon(existing);

  const currentMax = await db.prepare("SELECT MAX(position) AS position FROM addons WHERE user_id = ?")
    .bind(userId)
    .first<{ position: number | null }>();
  const position = addon.position ?? (currentMax?.position ?? 0) + 1;
  const next: Addon = {
    user_id: userId,
    added_at: nowIso(),
    transport_url: transportUrl,
    manifest: addon.manifest ?? {},
    flags: addon.flags ?? null,
    addon_id: optionalString(addon.addon_id) || crypto.randomUUID(),
    position,
    updated_at: nowIso(),
  };
  await applyRecord(db, userId, "addons", next);

  return next;
};

export const removeAddon = async (db: SyncD1Database, userId: string, transportUrl: unknown) => {
  await applyDeletion(db, userId, "addons", requireString(transportUrl, "transport_url"));
  return { ok: true };
};

export const hideFromContinueWatching = async (db: SyncD1Database, userId: string, imdbId: unknown) => {
  const key = requireString(imdbId, "imdb_id");
  const existing = await db.prepare("SELECT * FROM libraries WHERE user_id = ? AND imdb_id = ?")
    .bind(userId, key)
    .first<LibraryRow>();
  if (existing) {
    await applyRecord(db, userId, "library", {
      ...toLibraryItem(existing),
      shown: false,
      updated_at: nowIso(),
    });
  }
  return { ok: true };
};

export const forgetProgress = async (db: SyncD1Database, userId: string, imdbId: unknown) => {
  await applyDeletion(db, userId, "library", requireString(imdbId, "imdb_id"));
  return { ok: true };
};

export const updateLibraryProgress = async (
  db: SyncD1Database,
  userId: string,
  input: {
    imdb_id?: unknown;
    progress?: unknown;
    type?: unknown;
    completed?: unknown;
    poster?: unknown;
  },
) => {
  const imdbId = requireString(input.imdb_id, "imdb_id");
  const existing = await db.prepare("SELECT * FROM libraries WHERE user_id = ? AND imdb_id = ?")
    .bind(userId, imdbId)
    .first<LibraryRow>();
  const now = nowIso();
  const item: LibraryItem = {
    user_id: userId,
    imdb_id: imdbId,
    progress: toJsonValue(input.progress),
    last_watched: now,
    completed_at: input.completed === true
      ? now
      : input.completed === false
        ? null
        : existing?.completed_at ?? null,
    type: optionalString(input.type) || "movie",
    shown: true,
    poster: optionalString(input.poster) || existing?.poster || undefined,
    updated_at: now,
  };
  await applyRecord(db, userId, "library", item);

  return item;
};

export const updateLibraryPoster = async (
  db: SyncD1Database,
  userId: string,
  input: { imdb_id?: unknown; poster?: unknown },
) => {
  const imdbId = requireString(input.imdb_id, "imdb_id");
  const existing = await db.prepare("SELECT * FROM libraries WHERE user_id = ? AND imdb_id = ?")
    .bind(userId, imdbId)
    .first<LibraryRow>();
  if (existing) {
    await applyRecord(db, userId, "library", {
      ...toLibraryItem(existing),
      poster: requireString(input.poster, "poster"),
      updated_at: nowIso(),
    });
  }
  return { ok: true };
};

export const createList = async (db: SyncD1Database, userId: string, name: unknown) => {
  const currentMax = await db.prepare("SELECT MAX(position) AS position FROM lists WHERE user_id = ?")
    .bind(userId)
    .first<{ position: number | null }>();
  const list: List = {
    user_id: userId,
    list_id: crypto.randomUUID(),
    created_at: nowIso(),
    name: requireString(name, "name"),
    position: (currentMax?.position ?? 0) + 1,
    updated_at: nowIso(),
  };
  await applyRecord(db, userId, "lists", list);
  return list;
};

export const addToList = async (
  db: SyncD1Database,
  userId: string,
  input: {
    list_id?: unknown;
    imdb_id?: unknown;
    position?: unknown;
    type?: unknown;
    poster?: unknown;
  },
) => {
  const listId = requireString(input.list_id, "list_id");
  const list = await getListForUser(db, userId, listId);
  if (!list) throw new HttpError(404, "List not found", "list_not_found");

  const item: ListItem = {
    list_id: listId,
    imdb_id: requireString(input.imdb_id, "imdb_id"),
    position: toInteger(input.position),
    type: optionalString(input.type) || "movie",
    poster: optionalString(input.poster),
    updated_at: nowIso(),
  };
  await applyRecord(db, userId, "listItems", item);

  return item;
};

export const removeFromList = async (
  db: SyncD1Database,
  userId: string,
  input: { list_id?: unknown; imdb_id?: unknown },
) => {
  const listId = requireString(input.list_id, "list_id");
  const list = await getListForUser(db, userId, listId);
  if (!list) throw new HttpError(404, "List not found", "list_not_found");

  const imdbId = requireString(input.imdb_id, "imdb_id");
  await applyDeletion(db, userId, "listItems", `${listId}::${imdbId}`);
  return { ok: true };
};
