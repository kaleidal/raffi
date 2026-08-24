const BLOCKED_HOSTS = new Set([
  "adform.net",
  "adnami.io",
  "adnxs.com",
  "adroll.com",
  "adservice.google.com",
  "adskeeper.co.uk",
  "adskeeper.com",
  "adsrvr.org",
  "adsterra.com",
  "adsterra.org",
  "amazon-adsystem.com",
  "bidgear.com",
  "criteo.com",
  "criteo.net",
  "doubleclick.net",
  "exoclick.com",
  "exovertising.com",
  "googleadservices.com",
  "googlesyndication.com",
  "googletagservices.com",
  "highperformanceformat.com",
  "hilltopads.net",
  "indexww.com",
  "juicyads.com",
  "lijit.com",
  "media.net",
  "mgid.com",
  "moatads.com",
  "onclickalgo.com",
  "openx.net",
  "outbrain.com",
  "popads.net",
  "popcash.net",
  "propeller-tracking.com",
  "propellerads.com",
  "pubmatic.com",
  "quantserve.com",
  "revcontent.com",
  "rtbhouse.com",
  "rubiconproject.com",
  "scorecardresearch.com",
  "serving-sys.com",
  "sharethrough.com",
  "smartadserver.com",
  "taboola.com",
  "trafficjunky.net",
  "yieldlab.net",
  "yieldmo.com",
  "yllix.com",
]);

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const PATH_RESOURCE_TYPES = new Set([
  "image",
  "object",
  "other",
  "ping",
  "script",
  "stylesheet",
  "subFrame",
  "webSocket",
  "xhr",
]);
const TRACKING_RESOURCE_TYPES = new Set(["image", "ping", "script", "xhr"]);

const AD_PATH_PATTERN =
  /(^|[/.?&=_-])(adservice|adserver|ads|adsystem|adunit|advert|advertising|bannerads|popads|popunder|prebid|vast|vpaid)([/.?&=_-]|$)/i;
const TRACKING_PATH_PATTERN =
  /(^|[/.?&=_-])(analytics|pixel|tracking|tracker)([/.?&=_-]|$)/i;

function normalizeHost(hostname) {
  return String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
}

function isBlockedHost(hostname) {
  const host = normalizeHost(hostname);
  if (!host || LOCAL_HOSTS.has(host)) return false;
  if (BLOCKED_HOSTS.has(host)) return true;

  for (const blockedHost of BLOCKED_HOSTS) {
    if (host.endsWith(`.${blockedHost}`)) {
      return true;
    }
  }

  return false;
}

function shouldBlockRequest(details = {}) {
  let parsed;
  try {
    parsed = new URL(details.url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  const host = normalizeHost(parsed.hostname);
  if (!host || LOCAL_HOSTS.has(host)) {
    return false;
  }

  if (isBlockedHost(host)) {
    return true;
  }

  const resourceType = details.resourceType || "";
  if (!PATH_RESOURCE_TYPES.has(resourceType)) {
    return false;
  }

  const requestTarget = `${host}${parsed.pathname}${parsed.search}`;
  if (AD_PATH_PATTERN.test(requestTarget)) {
    return true;
  }

  return TRACKING_RESOURCE_TYPES.has(resourceType) && TRACKING_PATH_PATTERN.test(requestTarget);
}

function describeRequestUrl(value) {
  try {
    const url = new URL(value);
    const extension = url.pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
    return `${url.protocol}//${url.host}${extension ? `/*.${extension}` : "/*"}`;
  } catch {
    return "invalid-url";
  }
}

function readHeader(headers, name) {
  const match = Object.entries(headers || {}).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  const value = match?.[1];
  return Array.isArray(value) ? value.join(", ") : value || null;
}

function registerPlaybackNetworkDiagnostics({ session, logToFile }) {
  const requests = new Map();
  const filter = { urls: ["http://*/*", "https://*/*"] };
  const log = (event, details, extra = {}) => {
    const payload = {
      id: details.id,
      type: details.resourceType,
      target: describeRequestUrl(details.url),
      ...extra,
    };
    const message = `[Raffi playback network] ${event} ${JSON.stringify(payload)}`;
    console.info(message);
    logToFile?.(message);
  };

  session.webRequest.onSendHeaders(filter, (details) => {
    const range = readHeader(details.requestHeaders, "range");
    if (details.resourceType !== "media" && !range) return;
    requests.set(details.id, Date.now());
    log("request", details, { range });
  });

  session.webRequest.onHeadersReceived(filter, (details, callback) => {
    if (requests.has(details.id)) {
      log("response", details, {
        status: details.statusCode,
        contentType: readHeader(details.responseHeaders, "content-type"),
        contentLength: readHeader(details.responseHeaders, "content-length"),
        contentRange: readHeader(details.responseHeaders, "content-range"),
        acceptRanges: readHeader(details.responseHeaders, "accept-ranges"),
      });
    }
    callback({});
  });

  session.webRequest.onCompleted(filter, (details) => {
    const startedAt = requests.get(details.id);
    if (startedAt == null) return;
    requests.delete(details.id);
    log("complete", details, {
      status: details.statusCode,
      durationMs: Date.now() - startedAt,
      fromCache: details.fromCache,
    });
  });

  session.webRequest.onErrorOccurred(filter, (details) => {
    const startedAt = requests.get(details.id);
    if (startedAt == null) return;
    requests.delete(details.id);
    log("error", details, {
      error: details.error,
      durationMs: Date.now() - startedAt,
    });
  });
}

function registerContentBlocker({ session, logToFile }) {
  if (!session?.webRequest?.onBeforeRequest) {
    return;
  }

  session.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*"] },
    (details, callback) => {
      callback({ cancel: shouldBlockRequest(details) });
    },
  );

  registerPlaybackNetworkDiagnostics({ session, logToFile });

  logToFile?.("Content blocker registered");
}

module.exports = {
  registerContentBlocker,
};
