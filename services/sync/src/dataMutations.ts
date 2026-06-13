import { HttpError, optionalString } from "./http";
import type { Addon, JsonValue, LibraryItem, List, ListItem } from "./types";
import type { SyncD1Database } from "./d1Session";

type AddonRow = {
  user_id: string;
  added_at: string;
  transport_url: string;
  manifest: string;
  flags: string | null;
  addon_id: string;
  position: number | null;
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
};

type ListRow = {
  user_id: string;
  list_id: string;
  created_at: string;
  name: string;
  position: number;
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
});

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
  };

  await db.prepare(`
    INSERT INTO addons (user_id, added_at, transport_url, manifest, flags, addon_id, position)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    userId,
    next.added_at,
    next.transport_url,
    storedJson(next.manifest, {}),
    storedJson(next.flags),
    next.addon_id,
    next.position ?? 0,
  ).run();

  return next;
};

export const removeAddon = async (db: SyncD1Database, userId: string, transportUrl: unknown) => {
  await db.prepare("DELETE FROM addons WHERE user_id = ? AND transport_url = ?")
    .bind(userId, requireString(transportUrl, "transport_url"))
    .run();
  return { ok: true };
};

export const hideFromContinueWatching = async (db: SyncD1Database, userId: string, imdbId: unknown) => {
  await db.prepare("UPDATE libraries SET shown = 0 WHERE user_id = ? AND imdb_id = ?")
    .bind(userId, requireString(imdbId, "imdb_id"))
    .run();
  return { ok: true };
};

export const forgetProgress = async (db: SyncD1Database, userId: string, imdbId: unknown) => {
  await db.prepare("DELETE FROM libraries WHERE user_id = ? AND imdb_id = ?")
    .bind(userId, requireString(imdbId, "imdb_id"))
    .run();
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
  };

  await db.prepare(`
    INSERT INTO libraries (user_id, imdb_id, progress, last_watched, completed_at, type, shown, poster)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, imdb_id) DO UPDATE SET
      progress = excluded.progress,
      last_watched = excluded.last_watched,
      completed_at = excluded.completed_at,
      type = excluded.type,
      shown = excluded.shown,
      poster = excluded.poster
  `).bind(
    userId,
    item.imdb_id,
    storedJson(item.progress),
    item.last_watched,
    item.completed_at,
    item.type,
    1,
    item.poster ?? null,
  ).run();

  return item;
};

export const updateLibraryPoster = async (
  db: SyncD1Database,
  userId: string,
  input: { imdb_id?: unknown; poster?: unknown },
) => {
  await db.prepare("UPDATE libraries SET poster = ? WHERE user_id = ? AND imdb_id = ?")
    .bind(requireString(input.poster, "poster"), userId, requireString(input.imdb_id, "imdb_id"))
    .run();
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
  };
  await db.prepare(`
    INSERT INTO lists (user_id, list_id, created_at, name, position)
    VALUES (?, ?, ?, ?, ?)
  `).bind(userId, list.list_id, list.created_at, list.name, list.position).run();
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
  };

  await db.prepare(`
    INSERT INTO list_items (user_id, list_id, imdb_id, position, type, poster)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, list_id, imdb_id) DO UPDATE SET
      position = excluded.position,
      type = excluded.type,
      poster = excluded.poster
  `).bind(userId, item.list_id, item.imdb_id, item.position, item.type, item.poster ?? null).run();

  return item;
};

export const removeFromList = async (
  db: SyncD1Database,
  userId: string,
  input: { list_id?: unknown; imdb_id?: unknown },
) => {
  await db.prepare("DELETE FROM list_items WHERE user_id = ? AND list_id = ? AND imdb_id = ?")
    .bind(userId, requireString(input.list_id, "list_id"), requireString(input.imdb_id, "imdb_id"))
    .run();
  return { ok: true };
};
