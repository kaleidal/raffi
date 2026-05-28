CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  name TEXT,
  avatar TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS addons (
  user_id TEXT NOT NULL,
  transport_url TEXT NOT NULL,
  added_at TEXT NOT NULL,
  manifest TEXT NOT NULL,
  flags TEXT,
  addon_id TEXT NOT NULL,
  position INTEGER,
  PRIMARY KEY (user_id, transport_url)
);

CREATE INDEX IF NOT EXISTS addons_by_user_position ON addons (user_id, position, added_at);

CREATE TABLE IF NOT EXISTS libraries (
  user_id TEXT NOT NULL,
  imdb_id TEXT NOT NULL,
  progress TEXT NOT NULL,
  last_watched TEXT NOT NULL,
  completed_at TEXT,
  type TEXT NOT NULL,
  shown INTEGER NOT NULL,
  poster TEXT,
  PRIMARY KEY (user_id, imdb_id)
);

CREATE INDEX IF NOT EXISTS libraries_by_user_last_watched ON libraries (user_id, last_watched DESC);

CREATE TABLE IF NOT EXISTS lists (
  user_id TEXT NOT NULL,
  list_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (user_id, list_id)
);

CREATE INDEX IF NOT EXISTS lists_by_user_position ON lists (user_id, position);

CREATE TABLE IF NOT EXISTS list_items (
  user_id TEXT NOT NULL,
  list_id TEXT NOT NULL,
  imdb_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  type TEXT NOT NULL,
  poster TEXT,
  PRIMARY KEY (user_id, list_id, imdb_id)
);

CREATE INDEX IF NOT EXISTS list_items_by_user_list_position ON list_items (user_id, list_id, position);

CREATE TABLE IF NOT EXISTS user_meta (
  user_id TEXT PRIMARY KEY,
  settings TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trakt_integrations (
  user_id TEXT PRIMARY KEY,
  username TEXT,
  slug TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  scope TEXT,
  token_type TEXT,
  expires_at INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
