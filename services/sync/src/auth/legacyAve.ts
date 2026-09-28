import { refreshToken as refreshAveTokens } from "@ave-id/sdk";
import { verifyAveIdToken } from "@ave-id/sdk/server";
import type { AuthContext, BetterAuthPlugin, User } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import * as z from "zod";
import { HttpError } from "../http";
import { acceptsAveTokens } from "./aveCutoff";

type AveClaims = {
  sub: string;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  preferred_username?: unknown;
};

const USER_ID_CACHE_MAX_ENTRIES = 1000;
const userIdsByAveSubject = new Map<string, string>();

const aveConfig = (env: Env) => ({
  clientId: env.AVE_CLIENT_ID,
  issuer: env.AVE_ISSUER,
  redirectUri: "raffi://auth/callback",
});

type UserLookup = Pick<AuthContext, "internalAdapter">;

const verifyIdToken = async (env: Env, idToken: string): Promise<AveClaims | null> => {
  try {
    const claims = await verifyAveIdToken(idToken, { ...aveConfig(env), fetcher: fetch });
    return claims?.sub ? claims as AveClaims : null;
  } catch {
    return null;
  }
};

const refreshIdToken = async (env: Env, refreshToken: string): Promise<AveClaims | null> => {
  try {
    const tokens = await refreshAveTokens(aveConfig(env), { refreshToken });
    return tokens.id_token ? verifyIdToken(env, tokens.id_token) : null;
  } catch {
    return null;
  }
};

const verifiedEmail = (claims: AveClaims) => {
  if (typeof claims.email !== "string" || claims.email_verified === false) return null;
  return claims.email.trim().toLowerCase();
};

const displayName = (claims: AveClaims) => {
  if (typeof claims.name === "string") return claims.name;
  if (typeof claims.preferred_username === "string") return claims.preferred_username;
  return "";
};

const findOrCreateUser = async (context: UserLookup, claims: AveClaims): Promise<User | null> => {
  const migratedUser = await context.internalAdapter.findUserById(claims.sub);
  if (migratedUser) return migratedUser;

  const email = verifiedEmail(claims);
  if (!email) return null;

  const existing = await context.internalAdapter.findUserByEmail(email);
  if (existing) return existing.user;

  return context.internalAdapter.createUser({
    email,
    emailVerified: true,
    name: displayName(claims),
  }, { method: "ave-handoff" });
};

const rememberUserId = (subject: string, userId: string) => {
  if (userIdsByAveSubject.size >= USER_ID_CACHE_MAX_ENTRIES) userIdsByAveSubject.clear();
  userIdsByAveSubject.set(subject, userId);
};

export const resolveAveUserId = async (env: Env, context: UserLookup, idToken: string) => {
  const claims = await verifyIdToken(env, idToken);
  if (!claims) throw new HttpError(401, "Unauthorized", "unauthorized");

  const cached = userIdsByAveSubject.get(claims.sub);
  if (cached) return cached;

  const user = await findOrCreateUser(context, claims);
  if (!user) throw new HttpError(401, "Unauthorized", "unauthorized");
  rememberUserId(claims.sub, user.id);
  return user.id;
};

const handoffBody = z.object({
  idToken: z.string().optional(),
  refreshToken: z.string().optional(),
});

export const aveHandoff = (env: Env) => ({
  id: "ave-handoff",
  endpoints: {
    aveHandoff: createAuthEndpoint("/ave/handoff", {
      method: "POST",
      body: handoffBody,
    }, async (ctx) => {
      if (!acceptsAveTokens(env)) {
        throw APIError.fromStatus("GONE", { message: "Ave sign-in has been retired" });
      }

      const { idToken, refreshToken } = ctx.body;
      const claims = (idToken ? await verifyIdToken(env, idToken) : null)
        ?? (refreshToken ? await refreshIdToken(env, refreshToken) : null);
      if (!claims) {
        throw APIError.fromStatus("UNAUTHORIZED", { message: "Ave session is no longer valid" });
      }

      const user = await findOrCreateUser(ctx.context, claims);
      if (!user) {
        throw APIError.fromStatus("UNAUTHORIZED", { message: "Ave account has no verified email" });
      }

      const session = await ctx.context.internalAdapter.createSession(user.id);
      await setSessionCookie(ctx, { session, user });
      return ctx.json({ token: session.token, user });
    }),
  },
}) satisfies BetterAuthPlugin;
