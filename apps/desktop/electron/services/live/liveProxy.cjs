const { isHlsPlaylist, rewriteHlsPlaylist } = require("./hlsPlaylist.cjs");

const LIVE_SCHEME = "raffi-live";
const APP_ORIGINS = new Set(["raffi-app://app", "http://localhost:43173"]);
const PASSED_HEADERS = ["content-type", "content-range", "accept-ranges", "cache-control"];
const HLS_PEEK_LIMIT = 4 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const UNREACHABLE = 523;
const BAD_CERTIFICATE = 526;

const livePrivilegedScheme = {
  scheme: LIVE_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    stream: true,
    corsEnabled: true,
  },
};

function readTarget(requestUrl) {
  const params = new URL(requestUrl).searchParams;
  const url = params.get("url");
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return { url, userAgent: params.get("ua"), referer: params.get("referer") };
}

function proxyFor(target) {
  return (url) => {
    const params = new URLSearchParams({ url });
    if (target.userAgent) params.set("ua", target.userAgent);
    if (target.referer) params.set("referer", target.referer);
    return `${LIVE_SCHEME}://fetch/?${params}`;
  };
}

function corsHeaders(origin) {
  return origin
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-headers": "*",
        "access-control-expose-headers": "*",
      }
    : {};
}

function upstreamHeaders(request, target) {
  const headers = {};
  const range = request.headers.get("range");
  if (range) headers.range = range;
  if (target.userAgent) headers["user-agent"] = target.userAgent;
  if (target.referer) headers.referer = target.referer;
  return headers;
}

function responseHeaders(upstream, origin) {
  const headers = corsHeaders(origin);
  for (const name of PASSED_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }
  return headers;
}

/** Follows redirects by hand: Electron's fetch doesn't report where a response finally came from, and HLS links resolve against it. */
async function follow(liveSession, url, headers) {
  let address = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await liveSession.fetch(address, { headers, redirect: "manual" });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) return { response, address };
    void response.body?.cancel();
    address = new URL(location, address).href;
  }
  throw new Error("Too many redirects");
}

/** Reads the first chunk to tell an HLS playlist from video or a channel list, which then stream through untouched. */
async function peek(body) {
  const reader = body.getReader();
  const first = await reader.read();
  const head = first.done ? "" : Buffer.from(first.value).toString("utf8");
  const replay = new ReadableStream({
    start(controller) {
      if (first.done) controller.close();
      else controller.enqueue(first.value);
    },
    async pull(controller) {
      const next = await reader.read();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    cancel: (reason) => reader.cancel(reason),
  });
  return { isPlaylist: isHlsPlaylist(head), body: replay };
}

/**
 * Failures to connect answer 523 and certificate problems 526, so the app can tell them apart from the server's own errors.
 * Lets the renderer reach IPTV servers that don't allow cross-origin requests.
 * It answers only the app itself, runs in its own session so the content blocker never drops a stream,
 * and points the links inside HLS playlists back at itself.
 */
function createLiveProxyHandler({ protocol, session, logToFile }) {
  const liveSession = session.fromPartition("raffi-live");

  protocol.handle(LIVE_SCHEME, async (request) => {
    const origin = request.headers.get("origin");
    if (origin && !APP_ORIGINS.has(origin)) return new Response(null, { status: 403 });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });

    const target = readTarget(request.url);
    if (!target) return new Response("Invalid address", { status: 400, headers: corsHeaders(origin) });

    let upstream;
    let address;
    try {
      ({ response: upstream, address } = await follow(liveSession, target.url, upstreamHeaders(request, target)));
    } catch (error) {
      const reason = String(error?.message ?? error);
      logToFile("Live proxy request failed", { host: new URL(target.url).host, reason });
      const status = reason.includes("ERR_CERT") ? BAD_CERTIFICATE : UNREACHABLE;
      return new Response(null, { status, headers: corsHeaders(origin) });
    }

    const headers = responseHeaders(upstream, origin);
    const length = Number(upstream.headers.get("content-length"));
    if (!upstream.body || length > HLS_PEEK_LIMIT) {
      return new Response(upstream.body, { status: upstream.status, headers });
    }

    const { isPlaylist, body } = await peek(upstream.body);
    if (!isPlaylist) return new Response(body, { status: upstream.status, headers });

    const text = await new Response(body).text();
    return new Response(rewriteHlsPlaylist(text, address, proxyFor(target)), { status: upstream.status, headers });
  });
}

module.exports = { LIVE_SCHEME, livePrivilegedScheme, createLiveProxyHandler };
