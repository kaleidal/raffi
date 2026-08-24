import { Database, type SQLQueryBindings } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { applySyncState, getState } from "../src/db";
import type { JsonValue, LibraryItem, SyncPayload } from "../src/types";

class TestPreparedStatement {
  constructor(
    private readonly database: Database,
    private readonly sql: string,
    private readonly values: SQLQueryBindings[] = [],
  ) {}

  bind(...values: SQLQueryBindings[]) {
    return new TestPreparedStatement(this.database, this.sql, values);
  }

  async all<T>() {
    return { results: this.database.query(this.sql).all(...this.values) as T[] };
  }

  async first<T>() {
    return (this.database.query(this.sql).get(...this.values) as T | null) ?? null;
  }

  async run() {
    this.execute();
    return { success: true };
  }

  execute() {
    return this.database.query(this.sql).run(...this.values);
  }
}

class TestD1Database {
  constructor(private readonly database: Database) {}

  prepare(sql: string) {
    return new TestPreparedStatement(this.database, sql);
  }

  async batch(statements: TestPreparedStatement[]) {
    const execute = this.database.transaction(() => statements.map((statement) => {
      statement.execute();
      return { success: true };
    }));
    return execute();
  }
}

const iso = (timestamp: number) => new Date(timestamp).toISOString();

const libraryItem = (updatedAt: number, watched: boolean): LibraryItem => ({
  user_id: "user",
  imdb_id: "tt-sync",
  progress: { time: watched ? 100 : 0, duration: 100, watched, updatedAt },
  last_watched: iso(updatedAt),
  completed_at: watched ? iso(updatedAt) : null,
  type: "movie",
  shown: true,
  updated_at: iso(updatedAt),
});

const seriesItem = (updatedAt: number, progress: Record<string, JsonValue>): LibraryItem => ({
  ...libraryItem(updatedAt, false),
  type: "series",
  progress,
});

const payload = (item?: LibraryItem): SyncPayload => ({
  addons: [],
  library: item ? [item] : [],
  lists: [],
  listItems: [],
  deletes: [],
});

describe("timestamped cloud sync", () => {
  let sqlite: Database;
  let d1: TestD1Database;

  beforeEach(async () => {
    sqlite = new Database(":memory:");
    sqlite.exec(await Bun.file(new URL("../migrations/0001_initial.sql", import.meta.url)).text());
    sqlite.exec(await Bun.file(new URL("../migrations/0002_timestamped_sync.sql", import.meta.url)).text());
    d1 = new TestD1Database(sqlite);
  });

  test("older writes cannot replace a newer record", async () => {
    await applySyncState(d1 as any, "user", payload(libraryItem(2_000, false)), false);
    await applySyncState(d1 as any, "user", payload(libraryItem(1_000, true)), false);

    const state = await getState(d1 as any, "user");
    expect(state.library[0]?.progress).toMatchObject({ watched: false, updatedAt: 2_000 });
    expect(state.library[0]?.completed_at).toBeNull();
  });

  test("newest operation wins across deletion and recreation", async () => {
    await applySyncState(d1 as any, "user", payload(libraryItem(2_000, true)), false);
    await applySyncState(d1 as any, "user", {
      ...payload(),
      deletes: [{ section: "library", key: "tt-sync", updated_at: iso(3_000) }],
    }, false);
    await applySyncState(d1 as any, "user", payload(libraryItem(2_500, true)), false);

    expect((await getState(d1 as any, "user")).library).toEqual([]);

    await applySyncState(d1 as any, "user", payload(libraryItem(4_000, false)), false);
    const recreated = await getState(d1 as any, "user");
    expect(recreated.library).toHaveLength(1);
    expect(recreated.tombstones).toEqual([]);
  });

  test("concurrent updates to different episodes are preserved", async () => {
    await applySyncState(d1 as any, "user", payload(seriesItem(3_000, {
      "1:2": { time: 600, duration: 1_800, watched: false, updatedAt: 3_000 },
    })), false);
    await applySyncState(d1 as any, "user", payload(seriesItem(2_000, {
      "1:1": { time: 1_800, duration: 1_800, watched: true, updatedAt: 2_000 },
    })), false);

    const state = await getState(d1 as any, "user");
    expect(state.library[0]?.progress).toMatchObject({
      "1:1": { watched: true, updatedAt: 2_000 },
      "1:2": { watched: false, updatedAt: 3_000 },
    });
    expect(state.library[0]?.updated_at).toBe(iso(3_000));
  });
});
