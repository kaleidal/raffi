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

export const requireUserId = async (request: Request, env: Env): Promise<string> => {
  const token = request.headers.get("authorization")?.match(BEARER)?.[1];
  if (!token) throw unauthorized();

  if (readIssuer(token) !== env.BETTER_AUTH_URL) throw unauthorized();
  const userId = await verifySessionJwt(env, token);
  if (!userId) throw unauthorized();
  return userId;
};
