import { verifyWithDebounce, type DebounceVerdict } from "./debounce";

const VERIFIED_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_DAILY_LIMIT = 100;

type GateOptions = {
  db: D1Database;
  apiKey: string;
  dailyLimit?: string;
  now?: number;
};

// Overlapping requests for one address in this isolate share a single lookup.
const inFlight = new Map<string, Promise<DebounceVerdict>>();

const parseLimit = (value: string | undefined) => {
  const limit = Number(value);
  return Number.isInteger(limit) && limit >= 0 ? limit : DEFAULT_DAILY_LIMIT;
};

const wasVerified = async (db: D1Database, email: string, now: number) => {
  const row = await db.prepare(`SELECT "checkedAt" FROM "debounce_verified" WHERE "email" = ?`)
    .bind(email)
    .first<{ checkedAt: number }>();
  return row !== null && row.checkedAt > now - VERIFIED_TTL_MS;
};

// Counts the lookup before it happens, so a burst spread over many IPs still stops at the limit.
const reserveLookup = async (db: D1Database, now: number, limit: number) => {
  const day = new Date(now).toISOString().slice(0, 10);
  const row = await db.prepare(`
    INSERT INTO "debounce_usage" ("day", "lookups") VALUES (?, 1)
    ON CONFLICT ("day") DO UPDATE SET "lookups" = "lookups" + 1
    RETURNING "lookups"
  `).bind(day).first<{ lookups: number }>();
  return (row?.lookups ?? Infinity) <= limit;
};

const lookup = async ({ db, apiKey, dailyLimit, now = Date.now() }: GateOptions, email: string): Promise<DebounceVerdict> => {
  if (await wasVerified(db, email, now)) return { ok: true, checked: true };

  if (!await reserveLookup(db, now, parseLimit(dailyLimit))) {
    console.warn(JSON.stringify({ level: "warn", message: "DeBounce daily limit reached, skipping lookup" }));
    return { ok: true, checked: false };
  }

  const verdict = await verifyWithDebounce(apiKey, email);
  if (verdict.ok && verdict.checked) {
    await db.prepare(`
      INSERT INTO "debounce_verified" ("email", "checkedAt") VALUES (?, ?)
      ON CONFLICT ("email") DO UPDATE SET "checkedAt" = excluded."checkedAt"
    `).bind(email, now).run();
  }
  return verdict;
};

/**
 * DeBounce lookup with the cost controls around it: accepted addresses are remembered in
 * D1 for 30 days, and at most DEBOUNCE_DAILY_LIMIT (default 100) paid lookups run per
 * UTC day. Past the limit addresses go through on the local checks alone.
 */
export const checkWithDebounce = (options: GateOptions, email: string) => {
  const pending = inFlight.get(email);
  if (pending) return pending;
  const request = lookup(options, email).finally(() => inFlight.delete(email));
  inFlight.set(email, request);
  return request;
};
