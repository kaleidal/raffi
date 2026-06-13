import type { JsonValue } from "./types";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "error",
  ) {
    super(message);
  }
}

export const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
      ...headers,
    },
  });

export const empty = (status = 204) =>
  new Response(null, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });

export const readJson = async <T = JsonValue>(request: Request): Promise<T> => {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "Expected application/json", "unsupported_media_type");
  }
  try {
    return await request.json() as T;
  } catch {
    throw new HttpError(400, "Invalid JSON payload", "invalid_json");
  }
};

export const handleError = (error: unknown) => {
  if (error instanceof HttpError) {
    return json({ error: error.code, message: error.message }, error.status);
  }
  console.error(JSON.stringify({
    level: "error",
    message: error instanceof Error ? error.message : String(error),
  }));
  return json({ error: "internal_error", message: "Internal server error" }, 500);
};

export const getPathParts = (request: Request) => {
  const url = new URL(request.url);
  return url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
};

export const optionalString = (value: unknown) => {
  if (typeof value === "string" && value.trim().length > 0) return value;
  return undefined;
};
