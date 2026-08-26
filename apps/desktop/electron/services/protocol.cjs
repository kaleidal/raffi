const ALLOWED_EXTERNAL_HOSTS = new Set([
  "aveid.net",
  "www.aveid.net",
  "api.aveid.net",
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

function createProtocolUrlHandler({
  logToFile,
  getMainWindow,
  setPendingAveAuthPayload,
  setPendingTraktAuthPayload,
}) {
  return function handleProtocolUrl(url) {
    if (!url || typeof url !== "string") return false;
    if (!url.startsWith("raffi://")) return false;

    try {
      const parsed = new URL(url);
      const payload = {
        code: parsed.searchParams.get("code") || undefined,
        state: parsed.searchParams.get("state") || undefined,
        error: parsed.searchParams.get("error") || undefined,
        url,
      };

      if (parsed.hostname === "auth" && parsed.pathname === "/callback") {
        setPendingAveAuthPayload(payload);
        const mainWindow = getMainWindow();
        if (mainWindow && mainWindow.webContents) {
          mainWindow.__raffiMiniPlayer?.exit?.({ focus: false });
          mainWindow.webContents.send("AVE_AUTH_CALLBACK", payload);
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
        }
        return true;
      }

      if (parsed.hostname === "trakt" && parsed.pathname === "/callback") {
        setPendingTraktAuthPayload(payload);
        const mainWindow = getMainWindow();
        if (mainWindow && mainWindow.webContents) {
          mainWindow.__raffiMiniPlayer?.exit?.({ focus: false });
          mainWindow.webContents.send("TRAKT_AUTH_CALLBACK", payload);
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
        }
        return true;
      }

      return false;
    } catch (error) {
      logToFile("Failed to parse protocol URL", error);
      return false;
    }
  };
}

module.exports = {
  isAllowedExternalUrl,
  createProtocolUrlHandler,
};
