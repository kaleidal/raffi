import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkWithDebounce } from "../src/auth/debounceGate";

class TestStatement {
  constructor(private readonly database: Database, private readonly sql: string, private readonly values: unknown[] = []) {}

  bind(...values: unknown[]) {
    return new TestStatement(this.database, this.sql, values);
  }

  async first<T>() {
    return (this.database.query(this.sql).get(...(this.values as [])) as T | null) ?? null;
  }

  async run() {
    this.database.query(this.sql).run(...(this.values as []));
    return { success: true };
  }
}

const migration = readFileSync(join(import.meta.dir, "../migrations/0004_email_screening.sql"), "utf8");
const realFetch = globalThis.fetch;
let database: Database;
let db: D1Database;
let fetchMock: ReturnType<typeof mock>;

const debounceResult = (code: string) => Response.json({ success: "1", debounce: { code, did_you_mean: "" } });

beforeEach(() => {
  database = new Database(":memory:");
  database.exec(migration);
  db = { prepare: (sql: string) => new TestStatement(database, sql) } as unknown as D1Database;
  fetchMock = mock(async () => debounceResult("5"));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  database.close();
});

describe("checkWithDebounce", () => {
  test("remembers accepted addresses so repeat codes don't cost a lookup", async () => {
    expect(await checkWithDebounce({ db, apiKey: "key" }, "a@example.com")).toEqual({ ok: true, checked: true });
    expect(await checkWithDebounce({ db, apiKey: "key" }, "a@example.com")).toEqual({ ok: true, checked: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("looks addresses up again once the cached result expires", async () => {
    const now = Date.now();
    await checkWithDebounce({ db, apiKey: "key", now }, "a@example.com");
    await checkWithDebounce({ db, apiKey: "key", now: now + 31 * 24 * 60 * 60 * 1000 }, "a@example.com");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("doesn't cache rejections or failed lookups", async () => {
    fetchMock.mockImplementation(async () => debounceResult("6"));
    expect((await checkWithDebounce({ db, apiKey: "key" }, "a@example.com")).ok).toBe(false);
    expect((await checkWithDebounce({ db, apiKey: "key" }, "a@example.com")).ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("shares one lookup between overlapping requests", async () => {
    const results = await Promise.all([
      checkWithDebounce({ db, apiKey: "key" }, "a@example.com"),
      checkWithDebounce({ db, apiKey: "key" }, "a@example.com"),
    ]);
    expect(results).toEqual([{ ok: true, checked: true }, { ok: true, checked: true }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("lets addresses through without a lookup when D1 isn't ready", async () => {
    const error = console.error;
    console.error = () => {};
    try {
      const missingTables = new Database(":memory:");
      const unmigrated = { prepare: (sql: string) => new TestStatement(missingTables, sql) } as unknown as D1Database;
      expect(await checkWithDebounce({ db: unmigrated, apiKey: "key" }, "a@example.com")).toEqual({ ok: true, checked: false });
      expect(fetchMock).not.toHaveBeenCalled();
      missingTables.close();
    } finally {
      console.error = error;
    }
  });

  test("stops paying for lookups once the daily limit is spent", async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      for (const email of ["a@example.com", "b@example.com"]) {
        expect(await checkWithDebounce({ db, apiKey: "key", dailyLimit: "2" }, email)).toEqual({ ok: true, checked: true });
      }
      expect(await checkWithDebounce({ db, apiKey: "key", dailyLimit: "2" }, "c@example.com")).toEqual({ ok: true, checked: false });
      expect(fetchMock).toHaveBeenCalledTimes(2);

      const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
      expect(await checkWithDebounce({ db, apiKey: "key", dailyLimit: "2", now: tomorrow }, "c@example.com"))
        .toEqual({ ok: true, checked: true });
    } finally {
      console.warn = warn;
    }
  });
});
