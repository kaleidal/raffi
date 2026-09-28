import { requireUserId } from "./auth/requireUser";
import {
  addAddon,
  addToList,
  createList,
  forgetProgress,
  hideFromContinueWatching,
  removeAddon,
  removeFromList,
  updateLibraryPoster,
  updateLibraryProgress,
} from "./dataMutations";
import { applySyncState, ensureDefaultAddon, getState } from "./db";
import { empty, getPathParts, handleError, HttpError, json, readJson, withCors } from "./http";
import { removeAvatar, serveAvatar, uploadAvatar } from "./profile/avatars";
import {
  disconnectTrakt,
  exchangeTraktCode,
  getTraktClientAuth,
  getTraktStatus,
  refreshTraktToken,
  traktScrobble,
} from "./trakt";
import type { Addon, SyncPayload } from "./types";
import { WatchPartyObject } from "./watchParty";
import { getSyncDatabase } from "./d1Session";

export { WatchPartyObject };

type WatchPartyBody = {
  imdbId?: string;
  streamSource?: string;
  season?: number | null;
  episode?: number | null;
  fileIdx?: number | null;
};

const getPartyStub = (env: Env, partyId: string) => env.WATCH_PARTIES.getByName(partyId);

const routeWatchParty = async (
  request: Request,
  env: Env,
  userId: string,
  parts: string[],
) => {
  if (request.method === "POST" && parts.length === 1) {
    const body = await readJson<WatchPartyBody>(request);
    const partyId = crypto.randomUUID();
    const party = await getPartyStub(env, partyId).create(userId, {
      partyId,
      imdbId: body.imdbId || "",
      streamSource: body.streamSource || "",
      season: body.season ?? null,
      episode: body.episode ?? null,
      fileIdx: body.fileIdx ?? null,
    });
    return json(party);
  }

  const partyId = parts[1];
  if (!partyId) throw new HttpError(404, "Not found", "not_found");
  const action = parts[2];
  const stub = getPartyStub(env, partyId);

  if (request.method === "GET" && !action) {
    return json(await stub.getInfo(userId));
  }

  if (request.method === "GET" && action === "members") {
    return json(await stub.getMembers(userId));
  }

  if (request.method === "POST" && action === "join") {
    return json(await stub.join(userId));
  }

  if (request.method === "POST" && action === "leave") {
    return json(await stub.leave(userId));
  }

  if (request.method === "POST" && action === "heartbeat") {
    return json(await stub.heartbeat(userId));
  }

  if (request.method === "POST" && action === "state") {
    const body = await readJson<{ currentTimeSeconds?: number; isPlaying?: boolean }>(request);
    return json(await stub.updateState(
      userId,
      Number(body.currentTimeSeconds) || 0,
      Boolean(body.isPlaying),
    ));
  }

  throw new HttpError(404, "Not found", "not_found");
};

const routeAuthedRequest = async (request: Request, env: Env, parts: string[]) => {
  const userId = await requireUserId(request, env);
  const db = getSyncDatabase(env);

  if (parts[0] === "profile" && parts[1] === "avatar") {
    if (request.method === "PUT") return uploadAvatar(request, env, userId);
    if (request.method === "DELETE") return removeAvatar(env, userId);
  }

  if (request.method === "GET" && parts[0] === "state") {
    return json(await getState(db, userId));
  }

  if (request.method === "POST" && parts[0] === "sync") {
    return json(await applySyncState(db, userId, await readJson<SyncPayload>(request)));
  }

  if (request.method === "POST" && parts[0] === "addons" && parts[1] === "default") {
    const body = await readJson<{ addon?: { transportUrl?: unknown; manifest?: unknown } }>(request);
    return json(await ensureDefaultAddon(db, userId, body.addon || {}));
  }

  if (request.method === "POST" && parts[0] === "addons" && parts.length === 1) {
    const body = await readJson<{ addon?: Partial<Addon> }>(request);
    return json(await addAddon(db, userId, body.addon || {}));
  }

  if (request.method === "POST" && parts[0] === "addons" && parts[1] === "remove") {
    const body = await readJson<{ transport_url?: unknown }>(request);
    return json(await removeAddon(db, userId, body.transport_url));
  }

  if (request.method === "POST" && parts[0] === "library" && parts[1] === "hide") {
    const body = await readJson<{ imdb_id?: unknown }>(request);
    return json(await hideFromContinueWatching(db, userId, body.imdb_id));
  }

  if (request.method === "POST" && parts[0] === "library" && parts[1] === "forget") {
    const body = await readJson<{ imdb_id?: unknown }>(request);
    return json(await forgetProgress(db, userId, body.imdb_id));
  }

  if (request.method === "POST" && parts[0] === "library" && parts[1] === "progress") {
    return json(await updateLibraryProgress(db, userId, await readJson<{
      imdb_id?: unknown;
      progress?: unknown;
      type?: unknown;
      completed?: unknown;
      poster?: unknown;
    }>(request)));
  }

  if (request.method === "POST" && parts[0] === "library" && parts[1] === "poster") {
    return json(await updateLibraryPoster(db, userId, await readJson<{
      imdb_id?: unknown;
      poster?: unknown;
    }>(request)));
  }

  if (request.method === "POST" && parts[0] === "lists" && parts[1] === "create") {
    const body = await readJson<{ name?: unknown }>(request);
    return json(await createList(db, userId, body.name));
  }

  if (request.method === "POST" && parts[0] === "lists" && parts[1] === "items" && parts[2] === "add") {
    return json(await addToList(db, userId, await readJson<{
      list_id?: unknown;
      imdb_id?: unknown;
      position?: unknown;
      type?: unknown;
      poster?: unknown;
    }>(request)));
  }

  if (request.method === "POST" && parts[0] === "lists" && parts[1] === "items" && parts[2] === "remove") {
    return json(await removeFromList(db, userId, await readJson<{
      list_id?: unknown;
      imdb_id?: unknown;
    }>(request)));
  }

  if (parts[0] === "trakt") {
    if (request.method === "GET" && parts[1] === "status") {
      return json(await getTraktStatus(env, userId));
    }
    if (request.method === "POST" && parts[1] === "exchange-code") {
      const body = await readJson<{ code?: unknown }>(request);
      return json(await exchangeTraktCode(env, userId, body.code));
    }
    if (request.method === "POST" && parts[1] === "disconnect") {
      return json(await disconnectTrakt(env, userId));
    }
    if (request.method === "POST" && parts[1] === "refresh") {
      return json(await refreshTraktToken(env, userId));
    }
    if (request.method === "POST" && parts[1] === "client-auth") {
      const body = await readJson<{ forceRefresh?: unknown }>(request);
      return json(await getTraktClientAuth(env, userId, body.forceRefresh));
    }
    if (request.method === "POST" && parts[1] === "scrobble") {
      return json(await traktScrobble(env, userId, await readJson<{
        action?: unknown;
        imdbId?: unknown;
        mediaType?: unknown;
        season?: unknown;
        episode?: unknown;
        progress?: unknown;
        appVersion?: unknown;
      }>(request)));
    }
  }

  if (parts[0] === "watch-parties") {
    return routeWatchParty(request, env, userId, parts);
  }

  throw new HttpError(404, "Not found", "not_found");
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      if (request.method === "OPTIONS") return empty();
      const parts = getPathParts(request);
      if (request.method === "GET" && parts[0] === "health") {
        return json({ ok: true });
      }
      if (parts[0] === "auth") {
        const { getAuth } = await import("./auth/auth");
        return withCors(await getAuth(env).handler(request));
      }
      if (request.method === "GET" && parts[0] === "avatars" && parts.length === 3) {
        return await serveAvatar(request, env, `${parts[1]}/${parts[2]}`, ctx);
      }
      return await routeAuthedRequest(request, env, parts);
    } catch (error) {
      return handleError(error);
    }
  },
} satisfies ExportedHandler<Env>;
