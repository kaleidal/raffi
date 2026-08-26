const path = require("path");

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

function spawnDetached({ spawn, command, args, logToFile }) {
  let child;
  try {
    child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
    });
  } catch (error) {
    logToFile(`Failed to run ${command}`, error);
    return;
  }

  child.on("error", (error) => {
    logToFile(`Failed to run ${command}`, error);
  });
  child.unref();
}

function removeDesktopFile(fs, desktopPath, logToFile, reason) {
  try {
    if (!fs.existsSync(desktopPath)) return false;
    fs.unlinkSync(desktopPath);
    logToFile(reason);
    return true;
  } catch (error) {
    logToFile(`Failed removing ${desktopPath}`, error);
    return false;
  }
}

function writeUrlHandlerDesktop({
  fs,
  desktopPath,
  execLine,
  tryExec,
  iconName,
  startupWMClass,
  isDev,
}) {
  const desktopFile = [
    "[Desktop Entry]",
    isDev ? "Name=Raffi (Dev URL Handler)" : "Name=Raffi URL Handler",
    "Type=Application",
    "Terminal=false",
    `Exec=${execLine}`,
    `TryExec=${tryExec}`,
    `Icon=${iconName}`,
    `StartupWMClass=${startupWMClass}`,
    "StartupNotify=true",
    "NoDisplay=true",
    "MimeType=x-scheme-handler/raffi;",
    isDev ? "Categories=Development;" : "Categories=Network;",
    "Comment=Handle raffi:// links",
    "",
  ].join("\n");

  fs.writeFileSync(desktopPath, desktopFile, "utf8");
}

function registerLinuxProtocolHandler({
  app,
  fs,
  spawn,
  isDev,
  logToFile,
  iconName = "raffi",
  startupWMClass = "raffi",
}) {
  if (process.platform !== "linux") return;

  // AppImage mounts to a temporary path,
  // so using execPath messes up our .desktop entry
  // Use the actual image path in that case
  const packagedExecPath = process.env.APPIMAGE || process.execPath;

  try {
    const desktopDir = path.join(app.getPath("home"), ".local", "share", "applications");
    fs.mkdirSync(desktopDir, { recursive: true });

    const handlerFileName = isDev ? "raffi-dev-url-handler.desktop" : "raffi-url-handler.desktop";
    const localHandlerDesktop = path.join(desktopDir, handlerFileName);
    const staleHandlerDesktop = path.join(
      desktopDir,
      isDev ? "raffi-url-handler.desktop" : "raffi-dev-url-handler.desktop",
    );
    const launchTarget = isDev ? path.resolve(process.argv[1] || "") : process.execPath;
    const execLine = isDev
      ? `\"${process.execPath}\" \"${launchTarget}\" %U`
      : `\"${packagedExecPath}\" %U`;
    writeUrlHandlerDesktop({
      fs,
      desktopPath: localHandlerDesktop,
      execLine,
      tryExec: packagedExecPath,
      iconName,
      startupWMClass,
      isDev,
    });

    removeDesktopFile(
      fs,
      staleHandlerDesktop,
      logToFile,
      `Removed stale ${path.basename(staleHandlerDesktop)} entry`,
    );

    spawnDetached({
      spawn,
      command: "xdg-mime",
      args: ["default", handlerFileName, "x-scheme-handler/raffi"],
      logToFile,
    });
    spawnDetached({
      spawn,
      command: "xdg-settings",
      args: ["set", "default-url-scheme-handler", "raffi", handlerFileName],
      logToFile,
    });
    spawnDetached({
      spawn,
      command: "update-desktop-database",
      args: [desktopDir],
      logToFile,
    });
  } catch (error) {
    logToFile("Failed Linux x-scheme-handler registration", error);
  }
}

module.exports = {
  isAllowedExternalUrl,
  createProtocolUrlHandler,
  registerLinuxProtocolHandler,
};
