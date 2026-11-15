import { DurableObject } from "cloudflare:workers";
import { HttpError, optionalString } from "../http";
import type { WatchParty, WatchPartyInfo } from "../types";
import { PARTY_PROTOCOL, readClientMessage, type PlaybackState, type ServerMessage } from "./protocol";

const PARTY_LIFETIME_MS = 1000 * 60 * 60 * 8;

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

type Attachment = { userId: string };

const nowIso = () => new Date().toISOString();

const finiteOrNull = (value: unknown) => (Number.isFinite(Number(value)) && value !== null ? Number(value) : null);

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

const isLocalSource = (source: string | null) => Boolean(source) && !/^(https?:\/\/|magnet:)/.test(source ?? "");

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
          user_id TEXT PRIMARY KEY,
          joined_at TEXT NOT NULL
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
    const party: WatchParty = {
      party_id: args.partyId,
      host_user_id: userId,
      imdb_id: optionalString(args.imdbId) || "",
      season: finiteOrNull(args.season),
      episode: finiteOrNull(args.episode),
      stream_source: optionalString(args.streamSource) || "",
      file_idx: finiteOrNull(args.fileIdx),
      created_at: now,
      expires_at: new Date(Date.now() + PARTY_LIFETIME_MS).toISOString(),
      current_time_seconds: 0,
      is_playing: false,
      last_update: now,
    };

    if (!party.imdb_id || !party.stream_source) {
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
      party.party_id,
      party.host_user_id,
      party.imdb_id,
      party.season,
      party.episode,
      party.stream_source,
      party.file_idx,
      party.created_at,
      party.expires_at,
      party.current_time_seconds,
      0,
      party.last_update,
    );
    await this.ctx.storage.setAlarm(new Date(party.expires_at).getTime());
    return party;
  }

  join(userId: string): { ok: true } {
    this.requireActiveParty();
    this.ctx.storage.sql.exec(
      "INSERT INTO members (user_id, joined_at) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING",
      userId,
      nowIso(),
    );
    return { ok: true };
  }

  async leave(userId: string): Promise<{ ok: true }> {
    const party = this.getParty();
    if (!party) return { ok: true };
    if (party.host_user_id === userId) {
      await this.endParty("host_left");
      return { ok: true };
    }
    this.ctx.storage.sql.exec("DELETE FROM members WHERE user_id = ?", userId);
    const leaving = this.socketsOf(userId);
    for (const socket of leaving) socket.close(1000, "Left the party");
    this.announceMembers({ leaving });
    return { ok: true };
  }

  getInfo(userId: string): WatchPartyInfo | null {
    const party = this.getParty();
    if (!party || this.hasExpired(party)) return null;
    const member = this.isMember(party, userId);
    return {
      ...party,
      stream_source: member ? party.stream_source : null,
      file_idx: member ? party.file_idx : null,
      is_local_source: isLocalSource(party.stream_source),
      memberCount: this.connectedMembers(),
    };
  }

  /** Opens a member's live connection, which carries the host's playback to everyone else. */
  override async fetch(request: Request): Promise<Response> {
    const userId = request.headers.get("x-raffi-user");
    const party = this.getParty();
    if (!userId || !party || this.hasExpired(party)) return new Response("Party not found", { status: 404 });
    if (!this.isMember(party, userId)) return new Response("Join the party first", { status: 403 });

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId } satisfies Attachment);
    this.send(server, {
      type: "welcome",
      host: userId === party.host_user_id,
      state: this.playbackState(party),
      members: this.connectedMembers(),
    });
    this.announceMembers({ skip: server });

    return new Response(null, { status: 101, webSocket: client, headers: { "Sec-WebSocket-Protocol": PARTY_PROTOCOL } });
  }

  override webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    const message = readClientMessage(raw);
    if (!message) return;
    if (message.type === "ping") {
      this.send(socket, { type: "pong", sent: message.sent, server: Date.now() });
      return;
    }
    const party = this.getParty();
    if (!party || this.userOf(socket) !== party.host_user_id) return;
    const at = Date.now();
    const position = Math.max(0, message.position);
    this.ctx.storage.sql.exec(
      "UPDATE party SET current_time_seconds = ?, is_playing = ?, last_update = ?",
      position,
      message.playing ? 1 : 0,
      new Date(at).toISOString(),
    );
    this.broadcast({ type: "state", state: { position, playing: message.playing, at } }, socket);
  }

  override webSocketClose(socket: WebSocket) {
    this.announceMembers({ leaving: [socket] });
  }

  override async alarm(): Promise<void> {
    const party = this.getParty();
    if (party && this.hasExpired(party)) await this.endParty("expired");
  }

  private async endParty(reason: "host_left" | "expired") {
    this.broadcast({ type: "ended", reason });
    for (const socket of this.openSockets()) socket.close(1000, "Party ended");
    this.ctx.storage.sql.exec("DELETE FROM members");
    this.ctx.storage.sql.exec("DELETE FROM party");
    await this.ctx.storage.deleteAlarm();
  }

  private playbackState(party: WatchParty): PlaybackState {
    return {
      position: party.current_time_seconds,
      playing: party.is_playing,
      at: new Date(party.last_update).getTime(),
    };
  }

  private userOf(socket: WebSocket) {
    return (socket.deserializeAttachment() as Attachment).userId;
  }

  private openSockets() {
    return this.ctx.getWebSockets().filter((socket) => socket.readyState === WebSocket.OPEN);
  }

  private socketsOf(userId: string) {
    return this.openSockets().filter((socket) => this.userOf(socket) === userId);
  }

  /** Counts people rather than sockets, leaving out ones on their way out, whose state lags behind the close. */
  private connectedMembers(leaving: WebSocket[] = []) {
    const present = this.openSockets().filter((socket) => !leaving.includes(socket));
    return new Set(present.map((socket) => this.userOf(socket))).size;
  }

  private announceMembers({ leaving = [], skip }: { leaving?: WebSocket[]; skip?: WebSocket }) {
    const message: ServerMessage = { type: "members", count: this.connectedMembers(leaving) };
    for (const socket of this.openSockets()) {
      if (socket !== skip && !leaving.includes(socket)) socket.send(JSON.stringify(message));
    }
  }

  private broadcast(message: ServerMessage, except?: WebSocket) {
    const text = JSON.stringify(message);
    for (const socket of this.openSockets()) {
      if (socket !== except) socket.send(text);
    }
  }

  private send(socket: WebSocket, message: ServerMessage) {
    socket.send(JSON.stringify(message));
  }

  private isMember(party: WatchParty, userId: string) {
    if (party.host_user_id === userId) return true;
    return this.ctx.storage.sql
      .exec("SELECT 1 FROM members WHERE user_id = ? LIMIT 1", userId)
      .toArray().length > 0;
  }

  private hasExpired(party: WatchParty) {
    return new Date(party.expires_at).getTime() <= Date.now();
  }

  private getParty(): WatchParty | null {
    const row = this.ctx.storage.sql.exec<PartyRow>("SELECT * FROM party LIMIT 1").toArray()[0];
    return row ? toParty(row) : null;
  }

  private requireActiveParty(): WatchParty {
    const party = this.getParty();
    if (!party) throw new HttpError(404, "Party not found", "party_not_found");
    if (this.hasExpired(party)) throw new HttpError(410, "Party has expired", "party_expired");
    return party;
  }
}
