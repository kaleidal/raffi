import { verifyAveIdTokenFromAuthHeader } from "@ave-id/sdk/server";
import { HttpError } from "./http";
import type { AuthedUser } from "./types";
import { getSyncDatabase } from "./d1Session";

const PROFILE_UPSERT_TTL_MS = 60 * 60 * 1000;
const lastProfileUpsert = new Map<string, { hash: string; at: number }>();

const profileHash = (user: AuthedUser): string =>
  `${user.email ?? ""}\0${user.name ?? ""}\0${user.avatar ?? ""}`;

const shouldUpsertProfile = (user: AuthedUser): boolean => {
  const now = Date.now();
  const hash = profileHash(user);
  const previous = lastProfileUpsert.get(user.id);
  if (previous && previous.hash === hash && now - previous.at < PROFILE_UPSERT_TTL_MS) {
    return false;
  }
  lastProfileUpsert.set(user.id, { hash, at: now });
  return true;
};

export const requireUser = async (request: Request, env: Env): Promise<AuthedUser> => {
  const db = getSyncDatabase(env);
  const clientId = env.AVE_CLIENT_ID;
  if (!clientId) {
    throw new HttpError(500, "Ave client ID is not configured", "auth_not_configured");
  }

  const principal = await verifyAveIdTokenFromAuthHeader(
    request.headers.get("authorization"),
    {
      clientId,
      issuer: env.AVE_ISSUER || "https://aveid.net",
      fetcher: fetch,
    },
  );

  if (!principal?.subject) {
    throw new HttpError(401, "Unauthorized", "unauthorized");
  }

  const user: AuthedUser = {
    id: principal.subject,
    email: typeof principal.claims.email === "string" ? principal.claims.email : null,
    name: typeof principal.claims.name === "string"
      ? principal.claims.name
      : typeof principal.claims.preferred_username === "string"
        ? principal.claims.preferred_username
        : null,
    avatar: typeof principal.claims.picture === "string" ? principal.claims.picture : null,
  };

  if (shouldUpsertProfile(user)) {
    await db.prepare(`
      INSERT INTO users (id, email, name, avatar, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        name = excluded.name,
        avatar = excluded.avatar,
        updated_at = excluded.updated_at
    `).bind(user.id, user.email, user.name, user.avatar, new Date().toISOString()).run();
  }

  return user;
};
