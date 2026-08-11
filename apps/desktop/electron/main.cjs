const { app, BrowserWindow, dialog, screen, ipcMain, shell, protocol, net } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { createLogger } = require("./services/logging.cjs");
const { scanLibraryRoots } = require("./services/mediaScan.cjs");
const {
  isAllowedExternalUrl,
  createProtocolUrlHandler,
  registerLinuxProtocolHandler,
} = require("./services/protocol.cjs");
const {
  registerPrivilegedSchemes,
  createLocalMediaProtocolHandler,
} = require("./services/localMediaProtocol.cjs");
const { registerMainIpcHandlers } = require("./services/mainIpc.cjs");
const { registerDiscordRpcHandlers } = require("./services/rpc.cjs");
const { createMainWindow } = require("./services/window.cjs");
const { createDefenderService } = require("./services/defender.cjs");
const {
  ffmpegPrivilegedScheme,
  createFfmpegPlaybackService,
} = require("./services/ffmpegPlayback.cjs");

registerPrivilegedSchemes(protocol, [ffmpegPrivilegedScheme]);

const { logFallback, logToFile } = createLogger(app);

const isFlatpak = process.platform === "linux" && Boolean(process.env.FLATPAK_ID);

let autoUpdater = null;
if (!isFlatpak) {
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch (err) {
    logFallback("Failed to load electron-updater", err);
  }
}

const pendingAppUserModelId =
  process.platform === "win32" ? "al.kaleid.raffi" : null;

logFallback("Main process booting");
logToFile("Main process booting");

function isDiscordIPCConnectError(err) {
  const msg = (err && (err.message || String(err))) || "";
  // Matches the exact failure users hit when Discord isn't installed/running.
  return (
    ((err && err.name === "DiscordRPCError") ||
      msg.includes("DiscordRPCError")) &&
    (msg.includes("IPC connection error") ||
      msg.includes("discord-ipc-") ||
      msg.includes("\\\\.\\pipe\\discord-ipc") ||
      msg.includes("connect ENOENT"))
  );
}

// The discord RPC lib can throw from a socket error handler (not just reject a promise).
// Without a handler, Electron shows a fatal crash dialog. We only swallow the specific
// Discord IPC connect failure, and let all other errors crash normally.
process.on("uncaughtException", (err) => {
  if (isDiscordIPCConnectError(err)) {
    console.log("Ignoring Discord IPC connect failure:", err?.message || err);
    logToFile("Ignoring Discord IPC connect failure", err);
    return;
  }
  logToFile("Uncaught exception in main process", err);
  throw err;
});

process.on("unhandledRejection", (reason) => {
  if (isDiscordIPCConnectError(reason)) {
    console.log(
      "Ignoring Discord IPC rejection:",
      (reason && reason.message) || reason,
    );
    logToFile("Ignoring Discord IPC rejection", reason);
    return;
  }
  logToFile("Unhandled rejection in main process", reason);
});

app.on("ready", () => {
  logToFile("App ready");
});

app.on("window-all-closed", () => {
  logToFile("All windows closed");
});

app.on("render-process-gone", (_event, details) => {
  logToFile("Render process gone", details);
  ffmpegPlaybackService?.cleanup();
});

app.on("child-process-gone", (_event, details) => {
  logToFile("Child process gone", details);
});

let mainWindow;
let fileToOpen = null;
let pendingAveAuthPayload = null;
let pendingTraktAuthPayload = null;
let pendingUpdateInfo = null;
let ffmpegPlaybackService = null;
const handleProtocolUrl = createProtocolUrlHandler({
  logToFile,
  getMainWindow: () => mainWindow,
  setPendingAveAuthPayload: (payload) => {
    pendingAveAuthPayload = payload;
  },
  setPendingTraktAuthPayload: (payload) => {
    pendingTraktAuthPayload = payload;
  },
});


const MIN_ZOOM = 0.65;
const MAX_ZOOM = 1.0;
const WIDTH_THRESHOLD = 1600;

const DEFAULT_WINDOW_WIDTH = 1778;
const DEFAULT_WINDOW_HEIGHT = 1000;

const isDev = !app.isPackaged;
const linuxDesktopId = process.env.FLATPAK_ID || "raffi";
if (process.platform === "linux") {
  const enabledFeatures = new Set(
    app.commandLine
      .getSwitchValue("enable-features")
      .split(",")
      .map((feature) => feature.trim())
      .filter(Boolean),
  );
  enabledFeatures.add("AcceleratedVideoDecoder");

  try {
    const hasNvidiaGpu = fs
      .readdirSync("/sys/class/drm")
      .filter((entry) => /^card\d+$/.test(entry))
      .some((entry) => {
        const vendorPath = path.join("/sys/class/drm", entry, "device/vendor");
        return fs.readFileSync(vendorPath, "utf8").trim() === "0x10de";
      });
    if (hasNvidiaGpu) {
      enabledFeatures.add("VaapiOnNvidiaGPUs");
    }
  } catch {}

  app.commandLine.appendSwitch(
    "enable-features",
    [...enabledFeatures].join(","),
  );
  app.commandLine.appendSwitch("class", isFlatpak ? linuxDesktopId : "Raffi");
}
app.setName("Raffi");
if (process.platform === "linux" && !isDev) {
  try {
    app.setDesktopName(`${linuxDesktopId}.desktop`);
  } catch {
    // ignore
  }
}

const gotTheLock = app.requestSingleInstanceLock();
logToFile(`Single instance lock: ${gotTheLock ? "acquired" : "denied"}`);

app.on("open-file", (event, path) => {
  event.preventDefault();
  fileToOpen = path;
  if (mainWindow && mainWindow.webContents) {
    mainWindow.__raffiMiniPlayer?.exit?.({ focus: false });
    mainWindow.webContents.send("open-file", fileToOpen);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  handleProtocolUrl(url);
});

if (!gotTheLock) {
  logToFile("Another instance is running; quitting");
  app.quit();
} else {
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      mainWindow.__raffiMiniPlayer?.exit?.({ focus: false });
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();

      const deepLink = commandLine.find((arg) => typeof arg === "string" && arg.startsWith("raffi://"));
      if (deepLink && handleProtocolUrl(deepLink)) {
        return;
      }

      const filePath = commandLine[commandLine.length - 1];
      if (filePath && !filePath.startsWith("-") && filePath !== ".") {
        mainWindow.webContents.send("open-file", filePath);
      }
    }
  });
}

const defenderService = createDefenderService({
  logToFile,
});

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return;
  }
  mainWindow = createMainWindow({
    BrowserWindow,
    screen,
    fs,
    path,
    isDev,
    autoUpdater,
    logToFile,
    baseDir: __dirname,
    resourcesPath: process.resourcesPath,
    shell,
    isAllowedExternalUrl,
    defaultWindowWidth: DEFAULT_WINDOW_WIDTH,
    defaultWindowHeight: DEFAULT_WINDOW_HEIGHT,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    widthThreshold: WIDTH_THRESHOLD,
    fileToOpen,
    pendingAveAuthPayload,
    pendingTraktAuthPayload,
    setFileToOpen: (value) => {
      fileToOpen = value;
    },
    setPendingAveAuthPayload: (value) => {
      pendingAveAuthPayload = value;
    },
    setPendingTraktAuthPayload: (value) => {
      pendingTraktAuthPayload = value;
    },
    setPendingUpdateInfo: (value) => {
      pendingUpdateInfo = value;
    },
  });
}

app.whenReady().then(async () => {
  logToFile("App whenReady start");
  try {
    createLocalMediaProtocolHandler({ protocol, net, logToFile });
  } catch (error) {
    logToFile("Failed to register raffi-media protocol", error);
  }
  try {
    ffmpegPlaybackService = createFfmpegPlaybackService({
      app,
      protocol,
      ipcMain,
      spawn,
      baseDir: __dirname,
      resourcesPath: process.resourcesPath,
      logToFile,
    });
  } catch (error) {
    logToFile("Failed to register FFmpeg playback", error);
  }
  if (pendingAppUserModelId) {
    app.setAppUserModelId(pendingAppUserModelId);
  }

  if (!isFlatpak) {
    try {
      if (isDev && (process.platform === "win32" || process.platform === "linux")) {
        app.setAsDefaultProtocolClient("raffi", process.execPath, [path.resolve(process.argv[1])]);
      } else {
        app.setAsDefaultProtocolClient("raffi");
      }

      if (process.platform === "linux") {
        registerLinuxProtocolHandler({ app, fs, spawn, isDev, logToFile, desktopId: linuxDesktopId });
      }
    } catch (error) {
      logToFile("Failed to register raffi protocol", error);
    }
  } else {
    logToFile("Skipping host protocol registration inside Flatpak");
  }

  if (process.platform === "win32" || process.platform === "linux") {
    const argv = process.argv;
    const deepLink = argv.find((arg) => typeof arg === "string" && arg.startsWith("raffi://"));
    if (deepLink && handleProtocolUrl(deepLink)) {
      // handled as auth callback
    }

    let filePath = null;
    if (isDev && argv.length >= 3) {
      filePath = argv[2];
    } else if (!isDev && argv.length >= 2) {
      filePath = argv[1];
    }

    if (filePath && !filePath.startsWith("-") && !filePath.startsWith("raffi://")) {
      fileToOpen = filePath;
    }
  }
  createWindow();
});

app.on("activate", () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  mainWindow.__raffiMiniPlayer?.exit?.({ focus: false });
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

function cleanup() {
  ffmpegPlaybackService?.cleanup();
}

registerMainIpcHandlers({
  ipcMain,
  dialog,
  shell,
  fs,
  autoUpdater,
  isAllowedExternalUrl,
  cleanup,
  logToFile,
  getMainWindow: () => mainWindow,
  getDefenderExclusionStatus: () => defenderService.getExclusionStatus(),
  applyDefenderExclusions: () => defenderService.applyExclusions(),
  scanLibraryRoots,
});

app.on("before-quit", cleanup);
app.on("will-quit", cleanup);
app.on("quit", cleanup);

app.on("window-all-closed", () => {
  logToFile("All windows closed");
  cleanup();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});

process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});

const rpcService = registerDiscordRpcHandlers({ ipcMain, isDiscordIPCConnectError });

app.on("will-quit", () => {
  try {
    rpcService.destroyRPC();
  } catch {
    // ignore
  }
});
