import { decodeProtectedHeader, importJWK, jwtVerify, type CryptoKey } from "jose";

type JwksRow = {
  id: string;
  publicKey: string;
  alg: string | null;
};

const KEY_RELOAD_COOLDOWN_MS = 5_000;

let signingKeys = new Map<string, CryptoKey | Uint8Array>();
let keysLoadedAt = 0;
let pendingKeyLoad: Promise<void> | null = null;

const loadSigningKeys = async (db: D1Database) => {
  const { results } = await db.prepare("SELECT id, publicKey, alg FROM jwks").all<JwksRow>();
  const keys = new Map<string, CryptoKey | Uint8Array>();
  for (const row of results) {
    keys.set(row.id, await importJWK(JSON.parse(row.publicKey), row.alg ?? "EdDSA"));
  }
  signingKeys = keys;
  keysLoadedAt = Date.now();
};

const getSigningKey = async (db: D1Database, keyId: string) => {
  const known = signingKeys.get(keyId);
  if (known) return known;
  if (Date.now() - keysLoadedAt < KEY_RELOAD_COOLDOWN_MS) return null;
  pendingKeyLoad ??= loadSigningKeys(db).finally(() => {
    pendingKeyLoad = null;
  });
  await pendingKeyLoad;
  return signingKeys.get(keyId) ?? null;
};

export const verifySessionJwt = async (env: Env, token: string): Promise<string | null> => {
  try {
    const { kid } = decodeProtectedHeader(token);
    if (!kid) return null;
    const key = await getSigningKey(env.DB, kid);
    if (!key) return null;
    const { payload } = await jwtVerify(token, key, {
      issuer: env.BETTER_AUTH_URL,
      audience: env.BETTER_AUTH_URL,
    });
    return payload.sub ?? null;
  } catch {
    return null;
  }
};
