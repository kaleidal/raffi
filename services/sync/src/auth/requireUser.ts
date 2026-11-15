import { decodeJwt } from "jose";
import { HttpError } from "../http";
import { verifySessionJwt } from "./sessionJwt";

const BEARER = /^Bearer\s+(\S+)$/i;

const unauthorized = () => new HttpError(401, "Unauthorized", "unauthorized");

const readIssuer = (token: string) => {
  try {
    return decodeJwt(token).iss ?? null;
  } catch {
    return null;
  }
};

export const userIdFromToken = async (env: Env, token: string | undefined): Promise<string> => {
  if (!token || readIssuer(token) !== env.BETTER_AUTH_URL) throw unauthorized();
  const userId = await verifySessionJwt(env, token);
  if (!userId) throw unauthorized();
  return userId;
};

export const requireUserId = (request: Request, env: Env): Promise<string> =>
  userIdFromToken(env, request.headers.get("authorization")?.match(BEARER)?.[1]);
