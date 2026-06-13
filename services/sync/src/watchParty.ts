import { DurableObject } from "cloudflare:workers";
import { HttpError, optionalString } from "./http";
import type { WatchParty, WatchPartyInfo, WatchPartyMember } from "./types";

type PartyRow = {
  party_id: string;
  host_user_id: string;
  imdb_id: string;
  season: number | null;
  episode: number | null;
  stream_source: string;
  file_idx: number | null;
  created_at: string;
  expires_at: string;
  current_time_seconds: number;
  is_playing: number;
  last_update: string;
};

type MemberRow = {
  party_id: string;
  user_id: string;
  joined_at: string;
  last_seen: string;
};

const nowIso = () => new Date().toISOString();

const toParty = (row: PartyRow): WatchParty => ({
  party_id: row.party_id,
  host_user_id: row.host_user_id,
  imdb_id: row.imdb_id,
  season: row.season,
  episode: row.episode,
  stream_source: row.stream_source,
  file_idx: row.file_idx,
  created_at: row.created_at,
  expires_at: row.expires_at,
  current_time_seconds: Number(row.current_time_seconds) || 0,
  is_playing: row.is_playing !== 0,
  last_update: row.last_update,
});

const toMember = (row: MemberRow): WatchPartyMember => ({
  party_id: row.party_id,
  user_id: row.user_id,
  joined_at: row.joined_at,
  last_seen: row.last_seen,
});

export class WatchPartyObject extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS party (
          party_id TEXT PRIMARY KEY,
          host_user_id TEXT NOT NULL,
          imdb_id TEXT NOT NULL,
          season INTEGER,
          episode INTEGER,
          stream_source TEXT NOT NULL,
          file_idx INTEGER,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          current_time_seconds REAL NOT NULL,
          is_playing INTEGER NOT NULL,
          last_update TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS members (
          party_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          joined_at TEXT NOT NULL,
          last_seen TEXT NOT NULL,
          PRIMARY KEY (party_id, user_id)
        );
      `);
    });
  }

  async create(
    userId: string,
    args: {
      partyId: string;
      imdbId: string;
      streamSource: string;
      season?: number | null;
      episode?: number | null;
      fileIdx?: number | null;
    },
  ): Promise<WatchParty> {
    const existing = this.getParty();
    if (existing) return existing;

    const now = nowIso();
    const row: WatchParty = {
      party_id: args.partyId,
      host_user_id: userId,
      imdb_id: optionalString(args.imdbId) || "",
      season: Number.isFinite(Number(args.season)) ? Number(args.season) : null,
      episode: Number.isFinite(Number(args.episode)) ? Number(args.episode) : null,
      stream_source: optionalString(args.streamSource) || "",
      file_idx: Number.isFinite(Number(args.fileIdx)) ? Number(args.fileIdx) : null,
      created_at: now,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString(),
      current_time_seconds: 0,
      is_playing: false,
      last_update: now,
    };

    if (!row.imdb_id || !row.stream_source) {
      throw new HttpError(400, "Missing watch party media details", "invalid_watch_party");
    }

    this.ctx.storage.sql.exec(
      `
        INSERT INTO party (
          party_id, host_user_id, imdb_id, season, episode, stream_source, file_idx,
          created_at, expires_at, current_time_seconds, is_playing, last_update
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      row.party_id,
      row.host_user_id,
      row.imdb_id,
      row.season,
      row.episode,
      row.stream_source,
      row.file_idx,
      row.created_at,
      row.expires_at,
      row.current_time_seconds,
      row.is_playing ? 1 : 0,
      row.last_update,
    );
    this.upsertMember(row.party_id, userId, now);
    await this.ctx.storage.setAlarm(new Date(row.expires_at).getTime());
    return row;
  }

  join(userId: string): { ok: true } {
    const party = this.requireActiveParty();
    this.upsertMember(party.party_id, userId, nowIso());
    return { ok: true };
  }

  async leave(userId: string): Promise<{ ok: true }> {
    const party = this.getParty();
    if (!party) return { ok: true };

    this.ctx.storage.sql.exec(
      "DELETE FROM members WHERE party_id = ? AND user_id = ?",
      party.party_id,
      userId,
    );

    if (party.host_user_id === userId) {
      await this.deleteParty(party.party_id);
    }

    return { ok: true };
  }

  updateState(userId: string, currentTimeSeconds: number, isPlaying: boolean): { ok: true } {
    const party = this.getParty();
    if (!party || party.host_user_id !== userId) return { ok: true };

    this.ctx.storage.sql.exec(
      `
        UPDATE party
        SET current_time_seconds = ?, is_playing = ?, last_update = ?
        WHERE party_id = ?
      `,
      Math.max(0, Number(currentTimeSeconds) || 0),
      isPlaying ? 1 : 0,
      nowIso(),
      party.party_id,
    );

    return { ok: true };
  }

  heartbeat(userId: string): { ok: true } {
    const party = this.getParty();
    if (!party) return { ok: true };
    this.upsertMember(party.party_id, userId, nowIso());
    return { ok: true };
  }

  getInfo(): WatchPartyInfo | null {
    const party = this.getParty();
    if (!party) return null;
    if (new Date(party.expires_at).getTime() < Date.now()) {
      void this.deleteParty(party.party_id);
      return null;
    }
    const count = this.ctx.storage.sql
      .exec<{ count: number }>("SELECT COUNT(*) AS count FROM members WHERE party_id = ?", party.party_id)
      .one().count;
    return { ...party, memberCount: Number(count) || 0 };
  }

  getMembers(): WatchPartyMember[] {
    const party = this.getParty();
    if (!party) return [];
    return this.ctx.storage.sql
      .exec<MemberRow>(
        "SELECT party_id, user_id, joined_at, last_seen FROM members WHERE party_id = ? ORDER BY joined_at ASC",
        party.party_id,
      )
      .toArray()
      .map(toMember);
  }

  override async alarm(): Promise<void> {
    const party = this.getParty();
    if (!party) return;
    if (new Date(party.expires_at).getTime() <= Date.now()) {
      await this.deleteParty(party.party_id);
    }
  }

  private getParty(): WatchParty | null {
    const rows = this.ctx.storage.sql
      .exec<PartyRow>("SELECT * FROM party LIMIT 1")
      .toArray();
    return rows[0] ? toParty(rows[0]) : null;
  }

  private requireActiveParty(): WatchParty {
    const party = this.getParty();
    if (!party) throw new HttpError(404, "Party not found", "party_not_found");
    if (new Date(party.expires_at).getTime() < Date.now()) {
      void this.deleteParty(party.party_id);
      throw new HttpError(410, "Party has expired", "party_expired");
    }
    return party;
  }

  private upsertMember(partyId: string, userId: string, timestamp: string) {
    this.ctx.storage.sql.exec(
      `
        INSERT INTO members (party_id, user_id, joined_at, last_seen)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(party_id, user_id) DO UPDATE SET last_seen = excluded.last_seen
      `,
      partyId,
      userId,
      timestamp,
      timestamp,
    );
  }

  private async deleteParty(partyId: string) {
    this.ctx.storage.sql.exec("DELETE FROM members WHERE party_id = ?", partyId);
    this.ctx.storage.sql.exec("DELETE FROM party WHERE party_id = ?", partyId);
    await this.ctx.storage.deleteAlarm();
  }
}
