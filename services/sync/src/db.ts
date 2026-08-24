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

type ListItemRow = {
  list_id: string;
  imdb_id: string;
  position: number;
  type: string;
  poster: string | null;
  updated_at: string;
};

type UserMetaRow = {
  user_id: string;
  settings: string;
  updated_at: string;
};

type TombstoneRow = {
  section: RemoteState["tombstones"][number]["section"];
  item_key: string;
  updated_at: string;
};

const MAX_IMPORT_COUNTS = {
  addons: 500,
  library: 10_000,
  lists: 1_000,
  listItems: 20_000,
} as const;

const nowIso = () => new Date().toISOString();
const EPOCH = "1970-01-01T00:00:00.000Z";

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

const toList = (row: ListRow): List => ({
  user_id: row.user_id,
  list_id: row.list_id,
  created_at: row.created_at,
  name: row.name,
  position: row.position,
  updated_at: row.updated_at,
});

const toListItem = (row: ListItemRow): ListItem => ({
  list_id: row.list_id,
  imdb_id: row.imdb_id,
  position: row.position,
  type: row.type,
  poster: row.poster ?? undefined,
  updated_at: row.updated_at,
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
  const [addons, library, lists, listItems, userMeta, tombstones] = await Promise.all([
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
      SELECT list_id, imdb_id, position, type, poster, updated_at
      FROM list_items
      WHERE user_id = ?
      ORDER BY list_id ASC, position ASC
    `).bind(userId).all<ListItemRow>(),
    db.prepare("SELECT * FROM user_meta WHERE user_id = ?")
      .bind(userId)
      .first<UserMetaRow>(),
    db.prepare(`
      SELECT section, item_key, updated_at
      FROM sync_tombstones
      WHERE user_id = ?
      ORDER BY updated_at ASC
    `).bind(userId).all<TombstoneRow>(),
  ]);

  return {
    addons: (addons.results || []).map(toAddon),
    library: (library.results || []).map(toLibraryItem),
    lists: (lists.results || []).map(toList),
    listItems: (listItems.results || []).map(toListItem),
    userMeta: toUserMeta(userMeta || null),
    tombstones: (tombstones.results || []).map((row) => ({
      section: row.section,
      key: row.item_key,
      updated_at: row.updated_at,
    })),
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
  const updatedAt = nowIso();
  await db.batch([
    db.prepare(`
      INSERT INTO addons (user_id, added_at, transport_url, manifest, flags, addon_id, position, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      updatedAt,
      transportUrl,
      storedJson(addon.manifest, {}),
      storedJson({ protected: false, official: false }),
      addonId,
      1,
      updatedAt,
    ),
    db.prepare(`
      DELETE FROM sync_tombstones
      WHERE user_id = ? AND section = 'addons' AND item_key = ? AND updated_at < ?
    `).bind(userId, transportUrl, updatedAt),
  ]);

  return { ok: true, addon_id: addonId };
};

const normalizeTimestamp = (value: unknown, fallback: string) => {
  const parsed = Date.parse(optionalString(value) || "");
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
};

const tombstoneClearStatement = (
  db: SyncD1Database,
  userId: string,
  section: string,
  key: string,
  updatedAt: string,
) => db.prepare(`
  DELETE FROM sync_tombstones
  WHERE user_id = ? AND section = ? AND item_key = ? AND updated_at < ?
`).bind(userId, section, key, updatedAt);

const runStatementGroups = async (db: SyncD1Database, groups: D1PreparedStatement[][]) => {
  const batch: D1PreparedStatement[] = [];
  for (const group of groups) {
    if (batch.length + group.length > 300) {
      await db.batch(batch.splice(0));
    }
    batch.push(...group);
  }
  if (batch.length > 0) await db.batch(batch);
};

export const applySyncState = async (
  db: SyncD1Database,
  userId: string,
  payload: SyncPayload,
  includeState = true,
) => {
  const addons = uniqueBy(Array.isArray(payload.addons) ? payload.addons : [], (item) => item.transport_url || "");
  const library = uniqueBy(Array.isArray(payload.library) ? payload.library : [], (item) => item.imdb_id || "");
  const lists = uniqueBy(Array.isArray(payload.lists) ? payload.lists : [], (item) => item.list_id || "");
  const listItems = uniqueBy(
    Array.isArray(payload.listItems) ? payload.listItems : [],
    (item) => `${item.list_id || ""}::${item.imdb_id || ""}`,
  );
  const deletes = uniqueBy(
    Array.isArray(payload.deletes) ? payload.deletes : [],
    (item) => `${item.section || ""}:${item.key || ""}`,
  );

  assertCount("addons", addons.length);
  assertCount("library", library.length);
  assertCount("lists", lists.length);
  assertCount("listItems", listItems.length);
  assertCount("listItems", deletes.length);

  const groups: D1PreparedStatement[][] = [];

  for (const addon of addons) {
    const updatedAt = normalizeTimestamp(addon.updated_at, normalizeTimestamp(addon.added_at, EPOCH));
    groups.push([
      db.prepare(`
        INSERT INTO addons (user_id, added_at, transport_url, manifest, flags, addon_id, position, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM sync_tombstones
          WHERE user_id = ? AND section = 'addons' AND item_key = ? AND updated_at >= ?
        )
        ON CONFLICT(user_id, transport_url) DO UPDATE SET
          added_at = excluded.added_at,
          manifest = excluded.manifest,
          flags = excluded.flags,
          addon_id = excluded.addon_id,
          position = excluded.position,
          updated_at = excluded.updated_at
        WHERE excluded.updated_at > addons.updated_at
      `).bind(
        userId,
        optionalString(addon.added_at) || updatedAt,
        addon.transport_url,
        storedJson(addon.manifest, {}),
        addon.flags === undefined ? null : storedJson(addon.flags),
        optionalString(addon.addon_id) || crypto.randomUUID(),
        addon.position ?? 0,
        updatedAt,
        userId,
        addon.transport_url,
        updatedAt,
      ),
      tombstoneClearStatement(db, userId, "addons", addon.transport_url, updatedAt),
    ]);
  }

  for (const item of library) {
    const updatedAt = normalizeTimestamp(item.updated_at, normalizeTimestamp(item.last_watched, EPOCH));
    groups.push([
      db.prepare(`
        INSERT INTO libraries (user_id, imdb_id, progress, last_watched, completed_at, type, shown, poster, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM sync_tombstones
          WHERE user_id = ? AND section = 'library' AND item_key = ? AND updated_at >= ?
        )
        ON CONFLICT(user_id, imdb_id) DO UPDATE SET
          progress = CASE
            WHEN libraries.type = 'series' OR excluded.type = 'series' THEN COALESCE((
              SELECT json_group_object(entry_key, json(entry_value))
              FROM (
                SELECT entry_key, entry_value
                FROM (
                  SELECT
                    entry_key,
                    entry_value,
                    ROW_NUMBER() OVER (
                      PARTITION BY entry_key
                      ORDER BY
                        COALESCE(CAST(json_extract(entry_value, '$.updatedAt') AS INTEGER), 0) DESC,
                        COALESCE(CAST(json_extract(entry_value, '$.watched') AS INTEGER), 0) DESC,
                        source DESC
                    ) AS entry_rank
                  FROM (
                    SELECT key AS entry_key, value AS entry_value, 0 AS source FROM json_each(libraries.progress)
                    UNION ALL
                    SELECT key AS entry_key, value AS entry_value, 1 AS source FROM json_each(excluded.progress)
                  )
                )
                WHERE entry_rank = 1
              )
            ), '{}')
            WHEN excluded.updated_at > libraries.updated_at THEN excluded.progress
            ELSE libraries.progress
          END,
          last_watched = CASE WHEN excluded.updated_at > libraries.updated_at THEN excluded.last_watched ELSE libraries.last_watched END,
          completed_at = CASE WHEN excluded.updated_at > libraries.updated_at THEN excluded.completed_at ELSE libraries.completed_at END,
          type = CASE WHEN excluded.updated_at > libraries.updated_at THEN excluded.type ELSE libraries.type END,
          shown = CASE WHEN excluded.updated_at > libraries.updated_at THEN excluded.shown ELSE libraries.shown END,
          poster = CASE WHEN excluded.updated_at > libraries.updated_at THEN excluded.poster ELSE libraries.poster END,
          updated_at = MAX(libraries.updated_at, excluded.updated_at)
      `).bind(
        userId,
        item.imdb_id,
        storedJson(item.progress),
        optionalString(item.last_watched) || updatedAt,
        item.completed_at ?? null,
        optionalString(item.type) || "movie",
        item.shown === false ? 0 : 1,
        optionalString(item.poster) ?? null,
        updatedAt,
        userId,
        item.imdb_id,
        updatedAt,
      ),
      tombstoneClearStatement(db, userId, "library", item.imdb_id, updatedAt),
    ]);
  }

  for (const list of lists) {
    const updatedAt = normalizeTimestamp(list.updated_at, normalizeTimestamp(list.created_at, EPOCH));
    groups.push([
      db.prepare(`
        INSERT INTO lists (user_id, list_id, created_at, name, position, updated_at)
        SELECT ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM sync_tombstones
          WHERE user_id = ? AND section = 'lists' AND item_key = ? AND updated_at >= ?
        )
        ON CONFLICT(user_id, list_id) DO UPDATE SET
          created_at = excluded.created_at,
          name = excluded.name,
          position = excluded.position,
          updated_at = excluded.updated_at
        WHERE excluded.updated_at > lists.updated_at
      `).bind(
        userId,
        list.list_id,
        optionalString(list.created_at) || updatedAt,
        optionalString(list.name) || "Untitled",
        toInteger(list.position),
        updatedAt,
        userId,
        list.list_id,
        updatedAt,
      ),
      tombstoneClearStatement(db, userId, "lists", list.list_id, updatedAt),
    ]);
  }

  const ownedListIds = new Set(
    lists.map((list) => optionalString(list.list_id)).filter((id): id is string => Boolean(id)),
  );
  const existingLists = await db.prepare("SELECT list_id FROM lists WHERE user_id = ?")
    .bind(userId)
    .all<{ list_id: string }>();
  for (const row of existingLists.results || []) {
    if (row.list_id) ownedListIds.add(row.list_id);
  }

  for (const item of listItems) {
    const listId = optionalString(item.list_id);
    if (!listId || !ownedListIds.has(listId)) continue;
    const key = `${listId}::${item.imdb_id}`;
    const updatedAt = normalizeTimestamp(item.updated_at, EPOCH);
    groups.push([
      db.prepare(`
        INSERT INTO list_items (user_id, list_id, imdb_id, position, type, poster, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM sync_tombstones
          WHERE user_id = ? AND section = 'listItems' AND item_key = ? AND updated_at >= ?
        )
        AND EXISTS (SELECT 1 FROM lists WHERE user_id = ? AND list_id = ?)
        ON CONFLICT(user_id, list_id, imdb_id) DO UPDATE SET
          position = excluded.position,
          type = excluded.type,
          poster = excluded.poster,
          updated_at = excluded.updated_at
        WHERE excluded.updated_at > list_items.updated_at
      `).bind(
        userId,
        listId,
        item.imdb_id,
        toInteger(item.position),
        optionalString(item.type) || "movie",
        optionalString(item.poster) ?? null,
        updatedAt,
        userId,
        key,
        updatedAt,
        userId,
        listId,
      ),
      tombstoneClearStatement(db, userId, "listItems", key, updatedAt),
    ]);
  }

  if (payload.userMeta) {
    const updatedAt = normalizeTimestamp(payload.userMeta.updated_at, EPOCH);
    groups.push([
      db.prepare(`
        INSERT INTO user_meta (user_id, settings, updated_at)
        SELECT ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM sync_tombstones
          WHERE user_id = ? AND section = 'userMeta' AND item_key = 'settings' AND updated_at >= ?
        )
        ON CONFLICT(user_id) DO UPDATE SET
          settings = excluded.settings,
          updated_at = excluded.updated_at
        WHERE excluded.updated_at > user_meta.updated_at
      `).bind(userId, storedJson(payload.userMeta.settings, {}), updatedAt, userId, updatedAt),
      tombstoneClearStatement(db, userId, "userMeta", "settings", updatedAt),
    ]);
  }

  for (const deletion of deletes) {
    const section = deletion.section;
    const key = optionalString(deletion.key);
    if (!key || !["addons", "library", "lists", "listItems", "userMeta"].includes(section)) continue;
    const updatedAt = normalizeTimestamp(deletion.updated_at, EPOCH);
    const statements: D1PreparedStatement[] = [];

    if (section === "addons") {
      statements.push(db.prepare(`
        INSERT INTO sync_tombstones (user_id, section, item_key, updated_at)
        SELECT ?, 'addons', ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM addons WHERE user_id = ? AND transport_url = ? AND updated_at > ?)
        ON CONFLICT(user_id, section, item_key) DO UPDATE SET updated_at = excluded.updated_at
        WHERE excluded.updated_at > sync_tombstones.updated_at
      `).bind(userId, key, updatedAt, userId, key, updatedAt));
      statements.push(db.prepare("DELETE FROM addons WHERE user_id = ? AND transport_url = ? AND updated_at <= ?").bind(userId, key, updatedAt));
    } else if (section === "library") {
      statements.push(db.prepare(`
        INSERT INTO sync_tombstones (user_id, section, item_key, updated_at)
        SELECT ?, 'library', ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM libraries WHERE user_id = ? AND imdb_id = ? AND updated_at > ?)
        ON CONFLICT(user_id, section, item_key) DO UPDATE SET updated_at = excluded.updated_at
        WHERE excluded.updated_at > sync_tombstones.updated_at
      `).bind(userId, key, updatedAt, userId, key, updatedAt));
      statements.push(db.prepare("DELETE FROM libraries WHERE user_id = ? AND imdb_id = ? AND updated_at <= ?").bind(userId, key, updatedAt));
    } else if (section === "lists") {
      statements.push(db.prepare(`
        INSERT INTO sync_tombstones (user_id, section, item_key, updated_at)
        SELECT ?, 'lists', ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM lists WHERE user_id = ? AND list_id = ? AND updated_at > ?)
        ON CONFLICT(user_id, section, item_key) DO UPDATE SET updated_at = excluded.updated_at
        WHERE excluded.updated_at > sync_tombstones.updated_at
      `).bind(userId, key, updatedAt, userId, key, updatedAt));
      statements.push(db.prepare(`
        DELETE FROM list_items
        WHERE user_id = ? AND list_id = ?
          AND NOT EXISTS (
            SELECT 1 FROM lists
            WHERE user_id = ? AND list_id = ? AND updated_at > ?
          )
      `).bind(userId, key, userId, key, updatedAt));
      statements.push(db.prepare("DELETE FROM lists WHERE user_id = ? AND list_id = ? AND updated_at <= ?").bind(userId, key, updatedAt));
    } else if (section === "listItems") {
      const separator = key.indexOf("::");
      if (separator < 1) continue;
      const listId = key.slice(0, separator);
      const imdbId = key.slice(separator + 2);
      if (!imdbId) continue;
      statements.push(db.prepare(`
        INSERT INTO sync_tombstones (user_id, section, item_key, updated_at)
        SELECT ?, 'listItems', ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM list_items
          WHERE user_id = ? AND list_id = ? AND imdb_id = ? AND updated_at > ?
        )
        ON CONFLICT(user_id, section, item_key) DO UPDATE SET updated_at = excluded.updated_at
        WHERE excluded.updated_at > sync_tombstones.updated_at
      `).bind(userId, key, updatedAt, userId, listId, imdbId, updatedAt));
      statements.push(db.prepare(`
        DELETE FROM list_items
        WHERE user_id = ? AND list_id = ? AND imdb_id = ? AND updated_at <= ?
      `).bind(userId, listId, imdbId, updatedAt));
    } else {
      statements.push(db.prepare(`
        INSERT INTO sync_tombstones (user_id, section, item_key, updated_at)
        SELECT ?, 'userMeta', 'settings', ?
        WHERE NOT EXISTS (SELECT 1 FROM user_meta WHERE user_id = ? AND updated_at > ?)
        ON CONFLICT(user_id, section, item_key) DO UPDATE SET updated_at = excluded.updated_at
        WHERE excluded.updated_at > sync_tombstones.updated_at
      `).bind(userId, updatedAt, userId, updatedAt));
      statements.push(db.prepare("DELETE FROM user_meta WHERE user_id = ? AND updated_at <= ?").bind(userId, updatedAt));
    }
    groups.push(statements);
  }

  await runStatementGroups(db, groups);

  const result: {
    ok: true;
    deleted: number;
    state?: RemoteState;
  } = {
    ok: true,
    deleted: deletes.length,
  };
  if (includeState) result.state = await getState(db, userId);
  return result;
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
