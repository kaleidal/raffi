ALTER TABLE addons ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
UPDATE addons SET updated_at = added_at;

ALTER TABLE libraries ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
UPDATE libraries SET updated_at = last_watched;

ALTER TABLE lists ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
UPDATE lists SET updated_at = created_at;

ALTER TABLE list_items ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
UPDATE list_items SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

CREATE TABLE sync_tombstones (
  user_id TEXT NOT NULL,
  section TEXT NOT NULL CHECK (section IN ('addons', 'library', 'lists', 'listItems', 'userMeta')),
  item_key TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, section, item_key)
);

CREATE INDEX sync_tombstones_by_user_updated_at
  ON sync_tombstones (user_id, updated_at);
