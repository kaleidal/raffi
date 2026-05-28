import { requireUser } from "./auth";
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
import { empty, getPathParts, handleError, HttpError, json, readJson } from "./http";
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
  if (request.method === "GET" && parts[1] === "active") {
    return json([]);
  }

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
    return json(await stub.getInfo());
  }

  if (request.method === "GET" && action === "members") {
    return json(await stub.getMembers());
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

const routeAuthedRequest = async (request: Request, env: Env) => {
  const user = await requireUser(request, env);
  const parts = getPathParts(request);

  if (request.method === "GET" && parts[0] === "state") {
    return json(await getState(env.DB, user.id));
  }

  if (request.method === "POST" && parts[0] === "sync") {
    return json(await applySyncState(env.DB, user.id, await readJson<SyncPayload>(request)));
  }

  if (request.method === "POST" && parts[0] === "addons" && parts[1] === "default") {
    const body = await readJson<{ addon?: { transportUrl?: unknown; manifest?: unknown } }>(request);
    return json(await ensureDefaultAddon(env.DB, user.id, body.addon || {}));
  }

  if (request.method === "POST" && parts[0] === "addons" && parts.length === 1) {
    const body = await readJson<{ addon?: Partial<Addon> }>(request);
    return json(await addAddon(env.DB, user.id, body.addon || {}));
  }

  if (request.method === "POST" && parts[0] === "addons" && parts[1] === "remove") {
    const body = await readJson<{ transport_url?: unknown }>(request);
    return json(await removeAddon(env.DB, user.id, body.transport_url));
  }

  if (request.method === "POST" && parts[0] === "library" && parts[1] === "hide") {
    const body = await readJson<{ imdb_id?: unknown }>(request);
    return json(await hideFromContinueWatching(env.DB, user.id, body.imdb_id));
  }

  if (request.method === "POST" && parts[0] === "library" && parts[1] === "forget") {
    const body = await readJson<{ imdb_id?: unknown }>(request);
    return json(await forgetProgress(env.DB, user.id, body.imdb_id));
  }

  if (request.method === "POST" && parts[0] === "library" && parts[1] === "progress") {
    return json(await updateLibraryProgress(env.DB, user.id, await readJson<{
      imdb_id?: unknown;
      progress?: unknown;
      type?: unknown;
      completed?: unknown;
      poster?: unknown;
    }>(request)));
  }

  if (request.method === "POST" && parts[0] === "library" && parts[1] === "poster") {
    return json(await updateLibraryPoster(env.DB, user.id, await readJson<{
      imdb_id?: unknown;
      poster?: unknown;
    }>(request)));
  }

  if (request.method === "POST" && parts[0] === "lists" && parts[1] === "create") {
    const body = await readJson<{ name?: unknown }>(request);
    return json(await createList(env.DB, user.id, body.name));
  }

  if (request.method === "POST" && parts[0] === "lists" && parts[1] === "items" && parts[2] === "add") {
    return json(await addToList(env.DB, user.id, await readJson<{
      list_id?: unknown;
      imdb_id?: unknown;
      position?: unknown;
      type?: unknown;
      poster?: unknown;
    }>(request)));
  }

  if (request.method === "POST" && parts[0] === "lists" && parts[1] === "items" && parts[2] === "remove") {
    return json(await removeFromList(env.DB, user.id, await readJson<{
      list_id?: unknown;
      imdb_id?: unknown;
    }>(request)));
  }

  if (parts[0] === "trakt") {
    if (request.method === "GET" && parts[1] === "status") {
      return json(await getTraktStatus(env, user.id));
    }
    if (request.method === "POST" && parts[1] === "exchange-code") {
      const body = await readJson<{ code?: unknown }>(request);
      return json(await exchangeTraktCode(env, user.id, body.code));
    }
    if (request.method === "POST" && parts[1] === "disconnect") {
      return json(await disconnectTrakt(env, user.id));
    }
    if (request.method === "POST" && parts[1] === "refresh") {
      return json(await refreshTraktToken(env, user.id));
    }
    if (request.method === "POST" && parts[1] === "client-auth") {
      const body = await readJson<{ forceRefresh?: unknown }>(request);
      return json(await getTraktClientAuth(env, user.id, body.forceRefresh));
    }
    if (request.method === "POST" && parts[1] === "scrobble") {
      return json(await traktScrobble(env, user.id, await readJson<{
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
    return routeWatchParty(request, env, user.id, parts);
  }

  throw new HttpError(404, "Not found", "not_found");
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (request.method === "OPTIONS") return empty();
      const parts = getPathParts(request);
      if (request.method === "GET" && parts[0] === "health") {
        return json({ ok: true });
      }
      return await routeAuthedRequest(request, env);
    } catch (error) {
      return handleError(error);
    }
  },
} satisfies ExportedHandler<Env>;
