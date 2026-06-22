import { HttpError, optionalString } from "./http";
import type {
  Addon,
  JsonValue,
  LibraryItem,
  List,
  ListItem,
  RemoteState,
  SyncPayload,
  UserMeta,
} from "./types";
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

type ListItemRow = {
  list_id: string;
  imdb_id: string;
  position: number;
  type: string;
  poster: string | null;
};

type UserMetaRow = {
  user_id: string;
  settings: string;
  updated_at: string;
};

const MAX_IMPORT_COUNTS = {
  addons: 500,
  library: 10_000,
  lists: 1_000,
  listItems: 20_000,
} as const;

const nowIso = () => new Date().toISOString();

const parseStoredJson = (value: string | null | undefined, fallback: JsonValue): JsonValue => {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return fallback;
  }
};

const storedJson = (value: unknown, fallback: JsonValue = null) =>
  JSON.stringify(value === undefined ? fallback : value);

const toInteger = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};

const toNumberOrNull = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const assertCount = (section: keyof typeof MAX_IMPORT_COUNTS, count: number) => {
  const max = MAX_IMPORT_COUNTS[section];
  if (count > max) {
    throw new HttpError(413, `Import payload for ${section} is too large (${count}/${max})`, "payload_too_large");
  }
};

const uniqueBy = <T>(items: T[], keyFn: (item: T) => string) => {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = keyFn(item);
    if (key) map.set(key, item);
  }
  return Array.from(map.values());
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

const toLibraryItem = (row: LibraryRow): LibraryItem => ({
  user_id: row.user_id,
  imdb_id: row.imdb_id,
  progress: parseStoredJson(row.progress, null),
  last_watched: row.last_watched,
  completed_at: row.completed_at,
  type: row.type,
  shown: row.shown !== 0,
  poster: row.poster ?? undefined,
});

const toList = (row: ListRow): List => ({
  user_id: row.user_id,
  list_id: row.list_id,
  created_at: row.created_at,
  name: row.name,
  position: row.position,
});

const toListItem = (row: ListItemRow): ListItem => ({
  list_id: row.list_id,
  imdb_id: row.imdb_id,
  position: row.position,
  type: row.type,
  poster: row.poster ?? undefined,
});

const toUserMeta = (row: UserMetaRow | null): UserMeta | null => {
  if (!row) return null;
  return {
    user_id: row.user_id,
    settings: parseStoredJson(row.settings, {}),
    updated_at: row.updated_at,
  };
};

export const getState = async (db: SyncD1Database, userId: string): Promise<RemoteState> => {
  const [addons, library, lists, listItems, userMeta] = await Promise.all([
    db.prepare("SELECT * FROM addons WHERE user_id = ? ORDER BY position ASC, added_at ASC")
      .bind(userId)
      .all<AddonRow>(),
    db.prepare("SELECT * FROM libraries WHERE user_id = ? ORDER BY last_watched DESC")
      .bind(userId)
      .all<LibraryRow>(),
    db.prepare("SELECT * FROM lists WHERE user_id = ? ORDER BY position ASC, created_at ASC")
      .bind(userId)
      .all<ListRow>(),
    db.prepare(`
      SELECT list_id, imdb_id, position, type, poster
      FROM (
        SELECT
          item.list_id,
          item.imdb_id,
          item.position,
          item.type,
          item.poster,
          ROW_NUMBER() OVER (
            PARTITION BY item.list_id, item.imdb_id
            ORDER BY CASE WHEN item.user_id = ? THEN 0 ELSE 1 END, item.position ASC
          ) AS rank
        FROM list_items item
        INNER JOIN lists list
          ON list.list_id = item.list_id
          AND list.user_id = ?
        WHERE item.user_id = ?
          OR NOT EXISTS (
            SELECT 1 FROM lists item_owner
            WHERE item_owner.user_id = item.user_id
              AND item_owner.list_id = item.list_id
          )
      )
      WHERE rank = 1
      ORDER BY list_id ASC, position ASC
    `).bind(userId, userId, userId).all<ListItemRow>(),
    db.prepare("SELECT * FROM user_meta WHERE user_id = ?")
      .bind(userId)
      .first<UserMetaRow>(),
  ]);

  return {
    addons: (addons.results || []).map(toAddon),
    library: (library.results || []).map(toLibraryItem),
    lists: (lists.results || []).map(toList),
    listItems: (listItems.results || []).map(toListItem),
    userMeta: toUserMeta(userMeta || null),
  };
};

export const ensureDefaultAddon = async (
  db: SyncD1Database,
  userId: string,
  addon: { transportUrl?: unknown; manifest?: unknown },
) => {
  const transportUrl = optionalString(addon.transportUrl);
  if (!transportUrl) {
    throw new HttpError(400, "Missing addon transportUrl", "invalid_addon");
  }

  const existing = await db.prepare(`
    SELECT addon_id FROM addons WHERE user_id = ? AND transport_url = ?
  `).bind(userId, transportUrl).first<{ addon_id: string }>();

  if (existing?.addon_id) return { ok: true, addon_id: existing.addon_id };

  const addonId = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO addons (user_id, added_at, transport_url, manifest, flags, addon_id, position)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    userId,
    nowIso(),
    transportUrl,
    storedJson(addon.manifest, {}),
    storedJson({ protected: false, official: false }),
    addonId,
    1,
  ).run();

  return { ok: true, addon_id: addonId };
};

export const applySyncState = async (db: SyncD1Database, userId: string, payload: SyncPayload) => {
  const addons = uniqueBy(Array.isArray(payload.addons) ? payload.addons : [], (item) => item.transport_url || "");
  const library = uniqueBy(Array.isArray(payload.library) ? payload.library : [], (item) => item.imdb_id || "");
  const lists = uniqueBy(Array.isArray(payload.lists) ? payload.lists : [], (item) => item.list_id || "");
  const listItems = uniqueBy(
    Array.isArray(payload.listItems) ? payload.listItems : [],
    (item) => `${item.list_id || ""}:${item.imdb_id || ""}`,
  );

  assertCount("addons", addons.length);
  assertCount("library", library.length);
  assertCount("lists", lists.length);
  assertCount("listItems", listItems.length);

  const statements: D1PreparedStatement[] = [];
  const syncTime = nowIso();

  for (const addon of addons) {
    statements.push(db.prepare(`
      INSERT INTO addons (user_id, added_at, transport_url, manifest, flags, addon_id, position)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, transport_url) DO UPDATE SET
        added_at = excluded.added_at,
        manifest = excluded.manifest,
        flags = excluded.flags,
        addon_id = excluded.addon_id,
        position = excluded.position
    `).bind(
      userId,
      optionalString(addon.added_at) || syncTime,
      addon.transport_url,
      storedJson(addon.manifest, {}),
      addon.flags === undefined ? null : storedJson(addon.flags),
      optionalString(addon.addon_id) || crypto.randomUUID(),
      addon.position ?? 0,
    ));
  }

  for (const item of library) {
    statements.push(db.prepare(`
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
      optionalString(item.last_watched) || syncTime,
      item.completed_at ?? null,
      optionalString(item.type) || "movie",
      item.shown === false ? 0 : 1,
      optionalString(item.poster) ?? null,
    ));
  }

  for (const list of lists) {
    statements.push(db.prepare(`
      INSERT INTO lists (user_id, list_id, created_at, name, position)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, list_id) DO UPDATE SET
        created_at = excluded.created_at,
        name = excluded.name,
        position = excluded.position
    `).bind(
      userId,
      list.list_id,
      optionalString(list.created_at) || syncTime,
      optionalString(list.name) || "Untitled",
      toInteger(list.position),
    ));
  }

  for (const item of listItems) {
    statements.push(db.prepare(`
      INSERT INTO list_items (user_id, list_id, imdb_id, position, type, poster)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, list_id, imdb_id) DO UPDATE SET
        position = excluded.position,
        type = excluded.type,
        poster = excluded.poster
    `).bind(
      userId,
      item.list_id,
      item.imdb_id,
      toInteger(item.position),
      optionalString(item.type) || "movie",
      optionalString(item.poster) ?? null,
    ));
  }

  if (payload.userMeta) {
    statements.push(db.prepare(`
      INSERT INTO user_meta (user_id, settings, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        settings = excluded.settings,
        updated_at = excluded.updated_at
    `).bind(
      userId,
      storedJson(payload.userMeta.settings, {}),
      optionalString(payload.userMeta.updated_at) || syncTime,
    ));
  }

  for (const transportUrl of uniqueBy((payload.deletes?.addons || []).map((value) => ({ value })), (item) => item.value).map((item) => item.value)) {
    statements.push(db.prepare("DELETE FROM addons WHERE user_id = ? AND transport_url = ?").bind(userId, transportUrl));
  }

  for (const imdbId of uniqueBy((payload.deletes?.library || []).map((value) => ({ value })), (item) => item.value).map((item) => item.value)) {
    statements.push(db.prepare("DELETE FROM libraries WHERE user_id = ? AND imdb_id = ?").bind(userId, imdbId));
  }

  for (const listId of uniqueBy((payload.deletes?.lists || []).map((value) => ({ value })), (item) => item.value).map((item) => item.value)) {
    statements.push(db.prepare(`
      DELETE FROM list_items
      WHERE list_id = ?
        AND EXISTS (
          SELECT 1 FROM lists owned_list
          WHERE owned_list.user_id = ?
            AND owned_list.list_id = list_items.list_id
        )
        AND (
          user_id = ?
          OR NOT EXISTS (
            SELECT 1 FROM lists item_owner
            WHERE item_owner.user_id = list_items.user_id
              AND item_owner.list_id = list_items.list_id
          )
        )
    `).bind(listId, userId, userId));
    statements.push(db.prepare("DELETE FROM lists WHERE user_id = ? AND list_id = ?").bind(userId, listId));
  }

  const deletedListItems = uniqueBy(payload.deletes?.listItems || [], (item) => `${item.list_id}:${item.imdb_id}`);
  for (const item of deletedListItems) {
    statements.push(db.prepare(`
      DELETE FROM list_items
      WHERE list_id = ?
        AND imdb_id = ?
        AND EXISTS (
          SELECT 1 FROM lists owned_list
          WHERE owned_list.user_id = ?
            AND owned_list.list_id = list_items.list_id
        )
        AND (
          user_id = ?
          OR NOT EXISTS (
            SELECT 1 FROM lists item_owner
            WHERE item_owner.user_id = list_items.user_id
              AND item_owner.list_id = list_items.list_id
          )
        )
    `).bind(item.list_id, item.imdb_id, userId, userId));
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }

  return {
    ok: true,
    deleted: {
      addons: payload.deletes?.addons?.length || 0,
      library: payload.deletes?.library?.length || 0,
      lists: payload.deletes?.lists?.length || 0,
      listItems: payload.deletes?.listItems?.length || 0,
    },
  };
};

export const getTraktIntegration = async (db: SyncD1Database, userId: string) => {
  return db.prepare(`
    SELECT user_id, username, slug, access_token, refresh_token, scope, token_type, expires_at, created_at, updated_at
    FROM trakt_integrations
    WHERE user_id = ?
  `).bind(userId).first<{
    user_id: string;
    username: string | null;
    slug: string | null;
    access_token: string;
    refresh_token: string;
    scope: string | null;
    token_type: string | null;
    expires_at: number | null;
    created_at: string;
    updated_at: string;
  }>();
};

export const saveTraktIntegration = async (
  db: SyncD1Database,
  userId: string,
  values: {
    accessToken: string;
    refreshToken: string;
    scope?: string;
    tokenType?: string;
    expiresAt?: number | null;
    username?: string;
    slug?: string;
  },
) => {
  const now = nowIso();
  await db.prepare(`
    INSERT INTO trakt_integrations (
      user_id, username, slug, access_token, refresh_token, scope, token_type, expires_at, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      username = excluded.username,
      slug = excluded.slug,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      scope = excluded.scope,
      token_type = excluded.token_type,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
  `).bind(
    userId,
    values.username ?? null,
    values.slug ?? null,
    values.accessToken,
    values.refreshToken,
    values.scope ?? null,
    values.tokenType ?? null,
    toNumberOrNull(values.expiresAt),
    now,
    now,
  ).run();
};

export const deleteTraktIntegration = async (db: SyncD1Database, userId: string) => {
  await db.prepare("DELETE FROM trakt_integrations WHERE user_id = ?").bind(userId).run();
  return { ok: true };
};
