import { HttpError, optionalString } from "./http";

const FOLLOWED_HOSTS = new Set(["torrentio.strem.fun", "api.torbox.app"]);
const MAX_HOPS = 4;

const followable = (url: URL) => url.protocol === "https:" && FOLLOWED_HOSTS.has(url.hostname);

const parseTarget = (value: unknown) => {
  try {
    const url = new URL(optionalString(value) ?? "");
    if (followable(url)) return url;
  } catch {}
  throw new HttpError(400, "That stream can't be resolved", "unsupported_stream");
};

export const resolveStreamUrl = async (target: unknown) => {
  let current = parseTarget(target);
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const response = await fetch(current, {
      redirect: "manual",
      headers: { "User-Agent": "Raffi Sync" },
    });
    void response.body?.cancel();
    const location = response.headers.get("location");
    if (!location) {
      if (response.ok) return { url: current.href };
      throw new HttpError(502, `Stream host answered ${response.status}`, "stream_host_error");
    }
    const next = new URL(location, current);
    if (!followable(next)) return { url: next.href };
    current = next;
  }
  throw new HttpError(502, "Stream host redirected too many times", "stream_host_error");
};
