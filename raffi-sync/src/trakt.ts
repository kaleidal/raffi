import { deleteTraktIntegration, getTraktIntegration, saveTraktIntegration } from "./db";
import { HttpError, optionalString } from "./http";

const TRAKT_API_BASE_URL = "https://api.trakt.tv";
const TRAKT_AUTHORIZE_URL = "https://trakt.tv/oauth/authorize";
const DEFAULT_TRAKT_REDIRECT_URI = "raffi://trakt/callback";

const envString = (env: Env, key: string) => optionalString(Reflect.get(env, key));

const getTraktConfig = (env: Env) => {
  const clientId = envString(env, "TRAKT_CLIENT_ID");
  const clientSecret = envString(env, "TRAKT_CLIENT_SECRET");
  const redirectUri = envString(env, "TRAKT_REDIRECT_URI") || DEFAULT_TRAKT_REDIRECT_URI;
  return {
    clientId,
    clientSecret,
    redirectUri,
    configured: Boolean(clientId && clientSecret),
  };
};

const parseJsonSafe = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const buildTraktHeaders = (clientId: string, accessToken?: string) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "trakt-api-version": "2",
    "trakt-api-key": clientId,
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return headers;
};

const getTraktErrorMessage = (status: number, payload: unknown) => {
  const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const message = optionalString(body.error_description) || optionalString(body.error) || optionalString(body.message);
  return message || `Trakt request failed (${status})`;
};

const exchangeOrRefreshToken = async (
  body: Record<string, unknown>,
  config: { clientId: string; clientSecret: string },
) => {
  const response = await fetch(`${TRAKT_API_BASE_URL}/oauth/token`, {
    method: "POST",
    headers: buildTraktHeaders(config.clientId),
    body: JSON.stringify({
      ...body,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    throw new HttpError(response.status, getTraktErrorMessage(response.status, payload), "trakt_error");
  }
  return payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
};

const fetchTraktSettings = async (clientId: string, accessToken: string) => {
  const response = await fetch(`${TRAKT_API_BASE_URL}/users/settings`, {
    method: "GET",
    headers: buildTraktHeaders(clientId, accessToken),
  });
  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    throw new HttpError(response.status, getTraktErrorMessage(response.status, payload), "trakt_error");
  }
  return payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
};

const toExpiresAtMs = (payload: Record<string, unknown>): number | undefined => {
  const createdAt = Number(payload.created_at);
  const expiresIn = Number(payload.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) return undefined;
  const created = Number.isFinite(createdAt) && createdAt > 0
    ? createdAt
    : Math.floor(Date.now() / 1000);
  return Math.round((created + expiresIn) * 1000);
};

const getProfileValues = (settingsPayload: Record<string, unknown>) => {
  const user = settingsPayload.user && typeof settingsPayload.user === "object"
    ? settingsPayload.user as Record<string, unknown>
    : {};
  const ids = user.ids && typeof user.ids === "object" ? user.ids as Record<string, unknown> : {};
  return {
    username: optionalString(user.username),
    slug: optionalString(ids.slug) || optionalString(user.slug),
  };
};

export const getTraktStatus = async (env: Env, userId: string) => {
  const existing = await getTraktIntegration(env.DB, userId);
  const config = getTraktConfig(env);
  return {
    configured: config.configured,
    clientId: config.clientId ?? null,
    redirectUri: config.redirectUri,
    authorizeUrl: TRAKT_AUTHORIZE_URL,
    connected: Boolean(existing),
    username: existing?.username ?? null,
    slug: existing?.slug ?? null,
    scope: existing?.scope ?? null,
    updatedAt: existing?.updated_at ?? null,
    expiresAt: existing?.expires_at ?? null,
  };
};

export const exchangeTraktCode = async (env: Env, userId: string, code: unknown) => {
  const authCode = optionalString(code);
  const config = getTraktConfig(env);
  if (!authCode) throw new HttpError(400, "Missing Trakt authorization code", "missing_code");
  if (!config.clientId || !config.clientSecret) {
    throw new HttpError(500, "Trakt is not configured on the server", "trakt_not_configured");
  }

  const tokenPayload = await exchangeOrRefreshToken(
    {
      code: authCode,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    },
    { clientId: config.clientId, clientSecret: config.clientSecret },
  );

  const accessToken = optionalString(tokenPayload.access_token);
  const refreshToken = optionalString(tokenPayload.refresh_token);
  if (!accessToken || !refreshToken) {
    throw new HttpError(502, "Trakt token exchange returned an invalid payload", "trakt_invalid_payload");
  }

  let profile: { username?: string; slug?: string } = {};
  try {
    profile = getProfileValues(await fetchTraktSettings(config.clientId, accessToken));
  } catch {
    profile = {};
  }

  const expiresAt = toExpiresAtMs(tokenPayload);
  await saveTraktIntegration(env.DB, userId, {
    accessToken,
    refreshToken,
    scope: optionalString(tokenPayload.scope),
    tokenType: optionalString(tokenPayload.token_type),
    expiresAt,
    username: profile.username,
    slug: profile.slug,
  });

  return {
    ok: true,
    connected: true,
    username: profile.username ?? null,
    slug: profile.slug ?? null,
    scope: optionalString(tokenPayload.scope) ?? null,
    expiresAt: expiresAt ?? null,
  };
};

export const refreshTraktToken = async (env: Env, userId: string) => {
  const config = getTraktConfig(env);
  if (!config.clientId || !config.clientSecret) {
    throw new HttpError(500, "Trakt is not configured on the server", "trakt_not_configured");
  }

  const integration = await getTraktIntegration(env.DB, userId);
  if (!integration) {
    throw new HttpError(404, "Trakt is not connected", "trakt_not_connected");
  }

  const tokenPayload = await exchangeOrRefreshToken(
    {
      refresh_token: integration.refresh_token,
      grant_type: "refresh_token",
      redirect_uri: config.redirectUri,
    },
    { clientId: config.clientId, clientSecret: config.clientSecret },
  );

  const accessToken = optionalString(tokenPayload.access_token);
  const refreshToken = optionalString(tokenPayload.refresh_token);
  if (!accessToken || !refreshToken) {
    throw new HttpError(502, "Trakt refresh returned an invalid payload", "trakt_invalid_payload");
  }

  await saveTraktIntegration(env.DB, userId, {
    accessToken,
    refreshToken,
    scope: optionalString(tokenPayload.scope) || integration.scope || undefined,
    tokenType: optionalString(tokenPayload.token_type) || integration.token_type || undefined,
    expiresAt: toExpiresAtMs(tokenPayload),
    username: integration.username ?? undefined,
    slug: integration.slug ?? undefined,
  });

  return { ok: true };
};

export const disconnectTrakt = async (env: Env, userId: string) => {
  return deleteTraktIntegration(env.DB, userId);
};

export const getTraktClientAuth = async (env: Env, userId: string, forceRefresh: unknown) => {
  const config = getTraktConfig(env);
  if (!config.clientId || !config.clientSecret) {
    return {
      ok: false,
      configured: false,
      connected: false,
      reason: "not_configured",
      clientId: null,
      accessToken: null,
      expiresAt: null,
    };
  }

  const integration = await getTraktIntegration(env.DB, userId);
  if (!integration?.access_token || !integration?.refresh_token) {
    return {
      ok: false,
      configured: true,
      connected: false,
      reason: "not_connected",
      clientId: config.clientId,
      accessToken: null,
      expiresAt: null,
    };
  }

  const expiresAt = Number(integration.expires_at);
  const hasExpiry = Number.isFinite(expiresAt) && expiresAt > 0;
  const shouldRefresh = Boolean(forceRefresh) || (hasExpiry && expiresAt <= Date.now() + 30_000);

  if (!shouldRefresh) {
    return {
      ok: true,
      configured: true,
      connected: true,
      clientId: config.clientId,
      accessToken: integration.access_token,
      expiresAt: hasExpiry ? expiresAt : null,
    };
  }

  try {
    await refreshTraktToken(env, userId);
    const refreshed = await getTraktIntegration(env.DB, userId);
    return {
      ok: Boolean(refreshed?.access_token),
      configured: true,
      connected: Boolean(refreshed?.access_token),
      reason: refreshed?.access_token ? undefined : "refresh_failed",
      clientId: config.clientId,
      accessToken: refreshed?.access_token ?? null,
      expiresAt: refreshed?.expires_at ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      connected: false,
      reason: "refresh_failed",
      message: error instanceof Error ? error.message : String(error),
      clientId: config.clientId,
      accessToken: null,
      expiresAt: null,
    };
  }
};

export const traktScrobble = async (
  env: Env,
  userId: string,
  args: {
    action?: unknown;
    imdbId?: unknown;
    mediaType?: unknown;
    season?: unknown;
    episode?: unknown;
    progress?: unknown;
    appVersion?: unknown;
  },
) => {
  try {
    const config = getTraktConfig(env);
    if (!config.clientId || !config.clientSecret) {
      return { ok: false, reason: "not_configured" };
    }

    const integration = await getTraktIntegration(env.DB, userId);
    if (!integration?.access_token || !integration?.refresh_token) {
      return { ok: false, reason: "not_connected" };
    }

    const action = optionalString(args.action);
    if (action !== "start" && action !== "pause" && action !== "stop") {
      return { ok: false, reason: "invalid_action" };
    }

    const imdbId = optionalString(args.imdbId);
    if (!imdbId) return { ok: false, reason: "missing_imdb_id" };

    const progress = Math.max(0, Math.min(100, Number(args.progress) || 0));
    const payload: Record<string, unknown> = { progress };
    const appVersion = optionalString(args.appVersion);
    if (appVersion) payload.app_version = appVersion;

    if (args.mediaType === "movie") {
      payload.movie = { ids: { imdb: imdbId } };
    } else if (args.mediaType === "episode") {
      const season = Number(args.season);
      const episode = Number(args.episode);
      if (!Number.isFinite(season) || !Number.isFinite(episode)) {
        return { ok: false, reason: "missing_episode" };
      }
      payload.show = { ids: { imdb: imdbId } };
      payload.episode = { season, number: episode };
    } else {
      return { ok: false, reason: "invalid_media_type" };
    }

    const runScrobble = async (accessToken: string) => {
      const response = await fetch(`${TRAKT_API_BASE_URL}/scrobble/${action}`, {
        method: "POST",
        headers: buildTraktHeaders(config.clientId!, accessToken),
        body: JSON.stringify(payload),
      });
      const body = await parseJsonSafe(response);
      return { response, body };
    };

    let result = await runScrobble(integration.access_token);
    if (result.response.status === 401) {
      try {
        const tokenPayload = await exchangeOrRefreshToken(
          {
            refresh_token: integration.refresh_token,
            grant_type: "refresh_token",
            redirect_uri: config.redirectUri,
          },
          { clientId: config.clientId, clientSecret: config.clientSecret },
        );
        const refreshedAccess = optionalString(tokenPayload.access_token);
        const refreshedRefresh = optionalString(tokenPayload.refresh_token);
        if (refreshedAccess && refreshedRefresh) {
          await saveTraktIntegration(env.DB, userId, {
            accessToken: refreshedAccess,
            refreshToken: refreshedRefresh,
            scope: optionalString(tokenPayload.scope) || integration.scope || undefined,
            tokenType: optionalString(tokenPayload.token_type) || integration.token_type || undefined,
            expiresAt: toExpiresAtMs(tokenPayload),
            username: integration.username ?? undefined,
            slug: integration.slug ?? undefined,
          });
          result = await runScrobble(refreshedAccess);
        }
      } catch {
      }
    }

    if (result.response.ok) {
      return { ok: true, duplicate: false, action };
    }
    if (result.response.status === 409) {
      return { ok: true, duplicate: true, action };
    }

    return {
      ok: false,
      reason: "trakt_error",
      status: result.response.status,
      message: getTraktErrorMessage(result.response.status, result.body),
    };
  } catch (error) {
    return {
      ok: false,
      reason: "exception",
      message: error instanceof Error ? error.message : String(error),
    };
  }
};
