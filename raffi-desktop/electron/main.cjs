const { app, BrowserWindow, dialog, screen, ipcMain, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { createLogger } = require("./services/logging.cjs");
const { scanLibraryRoots } = require("./services/mediaScan.cjs");
const { ensureFFmpegAvailable } = require("./services/ffmpeg.cjs");
const {
  isAllowedExternalUrl,
  createProtocolUrlHandler,
  registerLinuxProtocolHandler,
} = require("./services/protocol.cjs");
const { createDecoderService } = require("./services/decoder.cjs");
const { createCastBootstrapService } = require("./services/castBootstrap.cjs");
const { createCastSenderService } = require("./services/castSender.cjs");
const { registerMainIpcHandlers } = require("./services/mainIpc.cjs");
const { registerDiscordRpcHandlers } = require("./services/rpc.cjs");
const { createMainWindow } = require("./services/window.cjs");

const { getLogPath, logFallback, logToFile } = createLogger(app);

let autoUpdater = null;
try {
  ({ autoUpdater } = require("electron-updater"));
} catch (err) {
  logFallback("Failed to load electron-updater", err);
}

const pendingAppUserModelId =
  process.platform === "win32" ? "al.kaleid.raffi" : null;

const express = require("express");

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
});

app.on("child-process-gone", (_event, details) => {
  logToFile("Child process gone", details);
});

let mainWindow;
let httpServer;
let fileToOpen = null;
let pendingAveAuthPayload = null;
let pendingTraktAuthPayload = null;
let pendingUpdateInfo = null;
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
if (process.platform === "linux") {
  app.commandLine.appendSwitch("class", "Raffi");
}
app.commandLine.appendSwitch("load-media-router-component-extension");
app.commandLine.appendSwitch(
  "enable-features",
  "MediaRouter,CastMediaRouteProvider,DialMediaRouteProvider",
);
app.setName("Raffi");
if (process.platform === "linux" && !isDev) {
  try {
    app.setDesktopName("raffi.desktop");
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

const decoderService = createDecoderService({
  isDev,
  path,
  fs,
  spawn,
  logToFile,
  baseDir: __dirname,
});

const decoderServerAddr = process.env.RAFFI_SERVER_ADDR || "0.0.0.0:6969";
const castBootstrapService = createCastBootstrapService({
  logToFile,
  serverAddr: decoderServerAddr,
});
const castSenderService = createCastSenderService({
  logToFile,
  BrowserWindow,
  path,
  baseDir: __dirname,
});

function createWindow() {
  mainWindow = createMainWindow({
    BrowserWindow,
    screen,
    fs,
    path,
    express,
    isDev,
    autoUpdater,
    logToFile,
    baseDir: __dirname,
    resourcesPath: process.resourcesPath,
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
    setHttpServer: (server) => {
      httpServer = server;
    },
  });
}

app.whenReady().then(async () => {
  logToFile("App whenReady start");
  if (pendingAppUserModelId) {
    app.setAppUserModelId(pendingAppUserModelId);
  }

  try {
    if (isDev && (process.platform === "win32" || process.platform === "linux")) {
      app.setAsDefaultProtocolClient("raffi", process.execPath, [path.resolve(process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient("raffi");
    }

    if (process.platform === "linux") {
      registerLinuxProtocolHandler({ app, fs, spawn, isDev, logToFile });
    }
  } catch (error) {
    logToFile("Failed to register raffi protocol", error);
  }

  if (process.platform === "win32" || process.platform === "linux") {
    const argv = process.argv;
    console.log("Command line args:", argv);

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
      console.log("Found file to open:", filePath);
      fileToOpen = filePath;
    }
  }

  logToFile("Checking ffmpeg availability");
  const ffmpegReady = await ensureFFmpegAvailable({ spawn, dialog });

  if (!ffmpegReady) {
    logToFile("FFmpeg missing; quitting");
    app.quit();
    return;
  }

  logToFile("Starting decoder server");
  try {
    await decoderService.startDecoderServer();
  } catch (err) {
    logToFile("Failed to start decoder server", err);
    dialog.showErrorBoxSync(
      "Decoder Error",
      `Failed to start decoder server: ${err.message}\n\nCheck logs at ${getLogPath()}`
    );
    app.quit();
    return;
  }

  logToFile("Waiting for decoder server to be ready");
  const decoderReady = await decoderService.waitForDecoderReady();
  
  if (!decoderReady) {
    logToFile("Decoder server failed to start, but creating window anyway");
    console.error("WARNING: Decoder server not responding, app may not work properly");
    createWindow();
    return;
  }

  logToFile("Decoder server ready, creating window");
  createWindow();
});

function cleanup() {
  console.log("Cleaning up...");
  console.log("Killing decoder server...");
  decoderService.cleanupDecoder();
  castSenderService.shutdown();
  if (httpServer) {
    console.log("Closing HTTP server...");
    httpServer.close();
  }
}

registerMainIpcHandlers({
  ipcMain,
  dialog,
  shell,
  autoUpdater,
  isAllowedExternalUrl,
  cleanup,
  logToFile,
  getMainWindow: () => mainWindow,
  scanLibraryRoots,
  castBootstrapService,
  castSenderService,
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
