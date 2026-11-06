const ALLOWED_EXTERNAL_HOSTS = new Set([
  "github.com",
  "www.github.com",
  "stator.sh",
  "www.stator.sh",
  "trakt.tv",
  "www.trakt.tv",
  "limbo.kaleid.al",
  "torbox.app",
  "www.torbox.app",
  "real-debrid.com",
  "www.real-debrid.com",
  "alldebrid.com",
  "www.alldebrid.com",
  "premiumize.me",
  "www.premiumize.me",
]);

function isAllowedAddonConfigureUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return false;
    const pathname = parsed.pathname.replace(/\/$/, "");
    return pathname === "/configure" || pathname.endsWith("/configure");
  } catch {
    return false;
  }
}

function isAllowedExternalUrl(value) {
  if (!value || typeof value !== "string") return false;
  if (isAllowedAddonConfigureUrl(value)) return true;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

module.exports = {
  isAllowedExternalUrl,
};
