import { HttpError, json } from "../http";

const MAX_AVATAR_BYTES = 512 * 1024;
const AVATAR_EXTENSIONS: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
};
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

const avatarUrlPrefix = (env: Env) => `${env.BETTER_AUTH_URL}/avatars/`;

const storedAvatarKey = (env: Env, image: string | null | undefined) => {
  const prefix = avatarUrlPrefix(env);
  return image?.startsWith(prefix) ? image.slice(prefix.length) : null;
};

const replaceUserImage = async (env: Env, userId: string, image: string | null) => {
  const user = await env.DB.prepare('SELECT image FROM "user" WHERE id = ?').bind(userId).first<{ image: string | null }>();
  if (!user) throw new HttpError(404, "Account not found", "not_found");
  await env.DB.prepare('UPDATE "user" SET image = ?, updatedAt = ? WHERE id = ?')
    .bind(image, new Date().toISOString(), userId)
    .run();
  const previousKey = storedAvatarKey(env, user.image);
  if (previousKey) await env.AVATARS.delete(previousKey);
};

export const uploadAvatar = async (request: Request, env: Env, userId: string) => {
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  const extension = AVATAR_EXTENSIONS[contentType];
  if (!extension) throw new HttpError(415, "Avatars must be WebP, PNG, or JPEG", "unsupported_media_type");

  const body = await request.arrayBuffer();
  if (body.byteLength === 0) throw new HttpError(400, "Avatar is empty", "invalid_avatar");
  if (body.byteLength > MAX_AVATAR_BYTES) throw new HttpError(413, "Avatar is too large", "avatar_too_large");

  const key = `${userId}/${crypto.randomUUID()}.${extension}`;
  await env.AVATARS.put(key, body, {
    httpMetadata: { contentType, cacheControl: IMMUTABLE_CACHE },
  });
  const image = `${avatarUrlPrefix(env)}${key}`;
  await replaceUserImage(env, userId, image);
  return json({ image });
};

export const removeAvatar = async (env: Env, userId: string) => {
  await replaceUserImage(env, userId, null);
  return json({ image: null });
};

export const serveAvatar = async (request: Request, env: Env, key: string, ctx: ExecutionContext) => {
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;

  const object = await env.AVATARS.get(key);
  if (!object) throw new HttpError(404, "Not found", "not_found");

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Access-Control-Allow-Origin", "*");
  const response = new Response(object.body, { headers });
  ctx.waitUntil(cache.put(request, response.clone()));
  return response;
};
