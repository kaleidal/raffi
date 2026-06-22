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

function readDesktopFile(fs, desktopPath) {
  try {
    if (!fs.existsSync(desktopPath)) return null;
    return fs.readFileSync(desktopPath, "utf8");
  } catch {
    return null;
  }
}

function isDevDesktopEntry(content) {
  if (!content) return false;
  return (
    content.includes("/node_modules/.bun/electron") ||
    content.includes("/node_modules/electron/") ||
    (content.includes("Categories=Development") && content.includes("electron"))
  );
}

function isPackagedDesktopEntry(content) {
  if (!content) return false;
  return content.includes("/opt/Raffi/raffi");
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

function writePackagedLauncherDesktop({
  fs,
  desktopPath,
  execPath,
  iconName,
  startupWMClass,
}) {
  const desktopFile = [
    "[Desktop Entry]",
    "Name=Raffi",
    "Type=Application",
    "Terminal=false",
    `Exec="${execPath}" %U`,
    `TryExec=${execPath}`,
    `Icon=${iconName}`,
    `StartupWMClass=${startupWMClass}`,
    "StartupNotify=true",
    "NoDisplay=false",
    "Categories=Video;",
    "Comment=A modern video player",
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
  desktopId = "raffi",
  iconName = "raffi",
  startupWMClass = "Raffi",
}) {
  if (process.platform !== "linux") return;

  try {
    const desktopDir = path.join(app.getPath("home"), ".local", "share", "applications");
    fs.mkdirSync(desktopDir, { recursive: true });

    const localMainDesktop = path.join(desktopDir, `${desktopId}.desktop`);
    const handlerFileName = isDev ? "raffi-dev-url-handler.desktop" : "raffi-url-handler.desktop";
    const localHandlerDesktop = path.join(desktopDir, handlerFileName);
    const staleHandlerDesktop = path.join(
      desktopDir,
      isDev ? "raffi-url-handler.desktop" : "raffi-dev-url-handler.desktop",
    );
    const launchTarget = isDev ? path.resolve(process.argv[1] || "") : process.execPath;
    const execLine = isDev
      ? `\"${process.execPath}\" \"${launchTarget}\" %U`
      : `\"${process.execPath}\" %U`;
    const existingMainDesktop = readDesktopFile(fs, localMainDesktop);

    if (isDev) {
      if (isDevDesktopEntry(existingMainDesktop)) {
        removeDesktopFile(
          fs,
          localMainDesktop,
          logToFile,
          "Removed dev-overwritten raffi.desktop launcher entry",
        );
      } else if (isPackagedDesktopEntry(existingMainDesktop)) {
        logToFile("Keeping packaged raffi.desktop launcher entry");
      }
    } else {
      if (isDevDesktopEntry(existingMainDesktop)) {
        removeDesktopFile(
          fs,
          localMainDesktop,
          logToFile,
          "Removed dev-overwritten raffi.desktop launcher entry",
        );
      }

      writePackagedLauncherDesktop({
        fs,
        desktopPath: localMainDesktop,
        execPath: process.execPath,
        iconName,
        startupWMClass,
      });
      logToFile("Updated packaged raffi.desktop launcher entry");
    }

    writeUrlHandlerDesktop({
      fs,
      desktopPath: localHandlerDesktop,
      execLine,
      tryExec: process.execPath,
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
