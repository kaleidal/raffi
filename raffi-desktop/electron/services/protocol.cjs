const path = require("path");

const ALLOWED_EXTERNAL_HOSTS = new Set([
  "aveid.net",
  "www.aveid.net",
  "api.aveid.net",
  "stator.sh",
  "www.stator.sh",
  "trakt.tv",
  "www.trakt.tv",
]);

function isAllowedExternalUrl(value) {
  if (!value || typeof value !== "string") return false;
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
      };

      if (parsed.hostname === "auth" && parsed.pathname === "/callback") {
        setPendingAveAuthPayload(payload);
        const mainWindow = getMainWindow();
        if (mainWindow && mainWindow.webContents) {
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

function registerLinuxProtocolHandler({ app, fs, spawn, isDev, logToFile }) {
  if (process.platform !== "linux") return;

  try {
    const desktopDir = path.join(app.getPath("home"), ".local", "share", "applications");
    fs.mkdirSync(desktopDir, { recursive: true });

    const localMainDesktop = path.join(desktopDir, "raffi.desktop");
    const localHandlerDesktop = path.join(desktopDir, "raffi-url-handler.desktop");
    const launchTarget = isDev ? path.resolve(process.argv[1] || "") : process.execPath;
    const execLine = isDev
      ? `\"${process.execPath}\" \"${launchTarget}\" %U`
      : `\"${process.execPath}\" %U`;

    const desktopFile = [
      "[Desktop Entry]",
      "Name=Raffi",
      "Type=Application",
      "Terminal=false",
      `Exec=${execLine}`,
      `TryExec=${process.execPath}`,
      "Icon=raffi",
      "StartupWMClass=Raffi",
      "StartupNotify=true",
      "NoDisplay=false",
      "MimeType=x-scheme-handler/raffi;",
      isDev ? "Categories=Development;Video;" : "Categories=Video;",
      "Comment=A modern video player",
      "",
    ].join("\n");

    fs.writeFileSync(localMainDesktop, desktopFile, "utf8");

    try {
      if (fs.existsSync(localHandlerDesktop)) {
        fs.unlinkSync(localHandlerDesktop);
      }
    } catch (error) {
      logToFile("Failed removing stale raffi-url-handler desktop entry", error);
    }

    const xdg = spawn("xdg-mime", ["default", "raffi.desktop", "x-scheme-handler/raffi"], {
      detached: true,
      stdio: "ignore",
    });
    xdg.unref();

    const xdgSettings = spawn("xdg-settings", ["set", "default-url-scheme-handler", "raffi", "raffi.desktop"], {
      detached: true,
      stdio: "ignore",
    });
    xdgSettings.unref();

    const updateDb = spawn("update-desktop-database", [desktopDir], {
      detached: true,
      stdio: "ignore",
    });
    updateDb.unref();
  } catch (error) {
    logToFile("Failed Linux x-scheme-handler registration", error);
  }
}

module.exports = {
  isAllowedExternalUrl,
  createProtocolUrlHandler,
  registerLinuxProtocolHandler,
};
