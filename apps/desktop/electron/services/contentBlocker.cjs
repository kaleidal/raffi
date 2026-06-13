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

  logToFile?.("Content blocker registered");
}

module.exports = {
  registerContentBlocker,
  shouldBlockRequest,
};
