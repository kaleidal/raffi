import { userIdFromToken } from "../auth/requireUser";
import { HttpError, json, readJson } from "../http";
import { PARTY_PROTOCOL } from "./protocol";

type CreateBody = {
  imdbId?: string;
  streamSource?: string;
  season?: number | null;
  episode?: number | null;
  fileIdx?: number | null;
};

const partyStub = (env: Env, partyId: string) => env.WATCH_PARTIES.getByName(partyId);

/** The party a WebSocket upgrade asks to join, if the request is one. */
export const partySocketTarget = (request: Request, parts: string[]) =>
  parts[0] === "watch-parties" && parts[2] === "socket" && request.headers.get("upgrade") === "websocket"
    ? parts[1]
    : undefined;

/** Browsers can't send headers with a WebSocket, so the session token rides along as the second subprotocol. */
export async function connectPartySocket(request: Request, env: Env, partyId: string) {
  const [protocol, token] = (request.headers.get("sec-websocket-protocol") ?? "").split(",").map((part) => part.trim());
  if (protocol !== PARTY_PROTOCOL) throw new HttpError(400, "Unsupported protocol", "unsupported_protocol");
  const userId = await userIdFromToken(env, token);
  const headers = new Headers(request.headers);
  headers.set("x-raffi-user", userId);
  return partyStub(env, partyId).fetch(new Request(request, { headers }));
}

export async function routeWatchParty(request: Request, env: Env, userId: string, parts: string[]) {
  if (request.method === "POST" && parts.length === 1) {
    const body = await readJson<CreateBody>(request);
    const partyId = crypto.randomUUID();
    return json(await partyStub(env, partyId).create(userId, {
      partyId,
      imdbId: body.imdbId || "",
      streamSource: body.streamSource || "",
      season: body.season ?? null,
      episode: body.episode ?? null,
      fileIdx: body.fileIdx ?? null,
    }));
  }

  const [, partyId, action] = parts;
  if (!partyId) throw new HttpError(404, "Not found", "not_found");
  const stub = partyStub(env, partyId);

  if (request.method === "GET" && !action) return json(await stub.getInfo(userId));
  if (request.method === "POST" && action === "join") return json(await stub.join(userId));
  if (request.method === "POST" && action === "leave") return json(await stub.leave(userId));

  throw new HttpError(404, "Not found", "not_found");
}
