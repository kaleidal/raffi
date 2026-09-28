import { decodeJwt } from "jose";
import { HttpError } from "../http";
import { acceptsAveTokens } from "./aveCutoff";
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

  const issuer = readIssuer(token);
  if (issuer === env.BETTER_AUTH_URL) {
    const userId = await verifySessionJwt(env, token);
    if (!userId) throw unauthorized();
    return userId;
  }

  if (issuer === env.AVE_ISSUER && acceptsAveTokens(env)) {
    const [{ getAuth }, { resolveAveUserId }] = await Promise.all([import("./auth"), import("./legacyAve")]);
    return resolveAveUserId(env, await getAuth(env).$context, token);
  }

  throw unauthorized();
};
