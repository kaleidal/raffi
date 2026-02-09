const { app, BrowserWindow, dialog, screen, ipcMain, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const getFallbackLogPath = () => {
  const baseDir =
    process.env.APPDATA ||
    process.env.LOCALAPPDATA ||
    process.env.TEMP ||
    process.cwd();
  const logDir = path.join(baseDir, "Raffi");
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch {
    // ignore
  }
  return path.join(logDir, "raffi-main.log");
};

const logFallback = (message, error) => {
  try {
    const logPath = getFallbackLogPath();
    const time = new Date().toISOString();
    const details = error ? `\n${error.stack || error.message || error}` : "";
    fs.appendFileSync(logPath, `[${time}] ${message}${details}\n`);
  } catch {
    // ignore
  }
};

let autoUpdater = null;
try {
  ({ autoUpdater } = require("electron-updater"));
} catch (err) {
  logFallback("Failed to load electron-updater", err);
}

const pendingAppUserModelId =
  process.platform === "win32" ? "al.kaleid.raffi" : null;

const express = require("express");

const getLogPath = () => {
  try {
    if (app && app.isReady()) {
      const logDir = app.getPath("userData");
      fs.mkdirSync(logDir, { recursive: true });
      return path.join(logDir, "raffi-main.log");
    }
  } catch {
    // ignore
  }

  return getFallbackLogPath();
};

const logToFile = (message, error) => {
  try {
    const logPath = getLogPath();
    const time = new Date().toISOString();
    const details = error ? `\n${error.stack || error.message || error}` : "";
    fs.appendFileSync(logPath, `[${time}] ${message}${details}\n`);
  } catch (err) {
    logFallback("Failed to write main log", err);
  }
};

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
let goServer;
let httpServer;
let fileToOpen = null;
let pendingAveAuthPayload = null;
let pendingUpdateInfo = null;

function handleProtocolUrl(url) {
  if (!url || typeof url !== "string") return false;
  if (!url.startsWith("raffi://")) return false;

  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "auth" || parsed.pathname !== "/callback") {
      return false;
    }

    pendingAveAuthPayload = {
      code: parsed.searchParams.get("code") || undefined,
      state: parsed.searchParams.get("state") || undefined,
      error: parsed.searchParams.get("error") || undefined,
    };

    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send("AVE_AUTH_CALLBACK", pendingAveAuthPayload);
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }

    return true;
  } catch (error) {
    logToFile("Failed to parse protocol URL", error);
    return false;
  }
}

const LOCAL_MEDIA_EXTS = new Set([
  ".mp4",
  ".mkv",
  ".webm",
  ".avi",
  ".mov",
  ".m4v",
]);

function cleanTitle(raw) {
  if (!raw) return "";
  return String(raw).replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
}

function stripReleaseJunk(name) {
  return String(name)
    .replace(/\b(480p|720p|1080p|2160p|4k)\b/gi, "")
    .replace(/\b(webrip|web[- ]?dl|bluray|brrip|hdtv|dvdrip)\b/gi, "")
    .replace(/\b(x264|x265|h264|h265|hevc|av1)\b/gi, "")
    .replace(/\b(aac|ac3|eac3|dts|truehd|opus)\b/gi, "")
    .replace(/\b(extended|remux|repack|proper)\b/gi, "")
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMediaFilename(fileName) {
  const base = path.basename(fileName, path.extname(fileName));
  const cleaned = stripReleaseJunk(base);

  // S01E01 / S1E1
  let m = cleaned.match(/\bS(\d{1,2})\s*E(\d{1,2})\b/i);
  if (!m) {
    // 1x01
    m = cleaned.match(/\b(\d{1,2})\s*x\s*(\d{1,2})\b/i);
  }

  if (m) {
    const season = Number(m[1]);
    const episode = Number(m[2]);
    const titlePart = cleaned.slice(0, m.index).trim();
    const title = cleanTitle(titlePart || cleaned);
    if (title && Number.isFinite(season) && Number.isFinite(episode)) {
      return { kind: "episode", title, season, episode };
    }
  }

  // Movie fallback: use folder/file base as title
  const title = cleanTitle(cleaned);
  if (!title) return null;
  return { kind: "movie", title };
}

async function scanDirRecursive(rootPath, out, options) {
  const { maxFiles } = options;
  if (out.length >= maxFiles) return;

  let entries;
  try {
    entries = await fs.promises.readdir(rootPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const ent of entries) {
    if (out.length >= maxFiles) return;
    const full = path.join(rootPath, ent.name);
    if (ent.isDirectory()) {
      // Skip very common junk folders
      const lower = ent.name.toLowerCase();
      if (lower === "sample" || lower === "samples") continue;
      await scanDirRecursive(full, out, options);
    } else if (ent.isFile()) {
      const ext = path.extname(ent.name).toLowerCase();
      if (!LOCAL_MEDIA_EXTS.has(ext)) continue;
      const parsed = parseMediaFilename(ent.name);
      if (!parsed) continue;
      out.push({ path: full, parsed });
    }
  }
}

async function scanLibraryRoots(roots) {
  const out = [];
  const options = { maxFiles: 20000 };
  for (const r of roots || []) {
    if (typeof r !== "string" || !r) continue;
    const resolved = path.resolve(r);
    await scanDirRecursive(resolved, out, options);
    if (out.length >= options.maxFiles) break;
  }
  return out;
}

const MIN_ZOOM = 0.65;
const MAX_ZOOM = 1.0;
const WIDTH_THRESHOLD = 1600;

const DEFAULT_WINDOW_WIDTH = 1778;
const DEFAULT_WINDOW_HEIGHT = 1000;

const isDev = !app.isPackaged;
if (process.platform === "linux") {
  app.commandLine.appendSwitch("class", "Raffi");
}
app.setName("Raffi");
if (process.platform === "linux" && !isDev) {
  try {
    app.setDesktopName("raffi.desktop");
  } catch {
    // ignore
  }
}

function registerLinuxProtocolHandler() {
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

function getDecoderPath() {
  const platform = process.platform;
  const arch = process.arch;

  if (isDev) {
    // dev: binaries live in electron/
    if (platform === "win32") {
      return path.join(__dirname, "decoder-windows-amd64.exe");
    } else if (platform === "darwin") {
      // build_binary.cjs creates decoder-aarch64-apple-darwin or decoder-x86_64-apple-darwin
      const macBinary = arch === "arm64" 
        ? "decoder-aarch64-apple-darwin" 
        : "decoder-x86_64-apple-darwin";
      return path.join(__dirname, macBinary);
    } else {
      return path.join(__dirname, "decoder-x86_64-unknown-linux-gnu");
    }
  } else {
    // prod: binaries copied into resources/ by electron-builder
    if (platform === "win32") {
      return path.join(process.resourcesPath, "decoder-windows-amd64.exe");
    } else if (platform === "darwin") {
      const macBinary = arch === "arm64" 
        ? "decoder-aarch64-apple-darwin" 
        : "decoder-x86_64-apple-darwin";
      return path.join(process.resourcesPath, macBinary);
    } else {
      return path.join(
        process.resourcesPath,
        "decoder-x86_64-unknown-linux-gnu",
      );
    }
  }
}

async function ensureDecoderExecutable(binPath) {
  // On Linux/Mac, ensure the decoder binary has executable permissions
  if (process.platform !== "win32") {
    try {
      await fs.promises.chmod(binPath, 0o755);
      logToFile(`Set executable permissions on ${binPath}`);
    } catch (err) {
      // EROFS (read-only filesystem) is expected when running from AppImage
      // EPERM (permission denied) is expected when installed via RPM/deb (root-owned files)
      // In both cases, the binary should already have executable permissions from packaging
      if (err.code === "EROFS" || err.code === "EPERM") {
        logToFile(`Skipping chmod (${err.code}): ${binPath}`);
      } else {
        logToFile(`Failed to set executable permissions on ${binPath}`, err);
        throw err;
      }
    }
  }
}

async function waitForDecoderReady(maxRetries = 30, retryDelayMs = 500) {
  // Wait for the decoder server to be ready by polling the health endpoint
  const serverUrl = "http://127.0.0.1:6969";
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const http = require("http");
      await new Promise((resolve, reject) => {
        const req = http.get(`${serverUrl}/`, (res) => {
          if (res.statusCode) {
            resolve();
          } else {
            reject(new Error(`Unexpected status code: ${res.statusCode}`));
          }
        });
        req.on("error", reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error("Timeout"));
        });
      });
      
      logToFile(`Decoder server ready after ${i + 1} attempts`);
      return true;
    } catch (err) {
      if (i === maxRetries - 1) {
        logToFile(`Decoder server not ready after ${maxRetries} attempts`, err);
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  
  return false;
}

function commandExists(command) {
  return new Promise((resolve) => {
    const checkCmd = process.platform === "win32" ? "where" : "which";
    const checker = spawn(checkCmd, [command]);
    checker.on("close", (code) => resolve(code === 0));
    checker.on("error", () => resolve(false));
  });
}

function hasFFmpeg() {
  return new Promise((resolve) => {
    const probe = spawn("ffmpeg", ["-version"]);
    probe.on("close", (code) => resolve(code === 0));
    probe.on("error", () => resolve(false));
  });
}

function hasLibx264() {
  return new Promise((resolve) => {
    const probe = spawn("ffmpeg", ["-encoders"]);
    let output = "";
    probe.stdout.on("data", (data) => {
      output += data.toString();
    });
    probe.on("close", (code) => {
      // Check if libx264 is in the encoders list
      resolve(code === 0 && output.includes("libx264"));
    });
    probe.on("error", () => resolve(false));
  });
}

function runLoggedCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      ...options,
      stdio: "pipe",
    });

    if (child.stdout) {
      child.stdout.on("data", (data) => {
        console.log(`[${command}] ${data.toString()}`);
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (data) => {
        console.error(`[${command} err] ${data.toString()}`);
      });
    }

    child.on("close", (code) => resolve(code === 0));
    child.on("error", (err) => {
      console.error(`${command} failed:`, err.message);
      resolve(false);
    });
  });
}

function runShellCommand(cmd) {
  if (process.platform === "win32") {
    return runLoggedCommand("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      cmd,
    ]);
  }
  return runLoggedCommand("bash", ["-lc", cmd]);
}

async function installFFmpegOnWindows() {
  const hasWinget = await commandExists("winget");
  if (!hasWinget) {
    console.warn("winget not available, cannot auto-install ffmpeg");
    return false;
  }
  console.log("Attempting to install FFmpeg via winget...");
  return runLoggedCommand("winget", [
    "install",
    "--id",
    "FFmpeg.FFmpeg",
    "-e",
    "--accept-package-agreements",
    "--accept-source-agreements",
  ]);
}

async function installFFmpegOnLinux() {
  const packageManagers = [
    {
      name: "apt-get",
      command: "sudo -n apt-get update && sudo -n apt-get install -y ffmpeg",
    },
    {
      name: "dnf",
      command: "sudo -n dnf install -y ffmpeg",
    },
    {
      name: "pacman",
      command: "sudo -n pacman -Sy --noconfirm ffmpeg",
    },
  ];

  for (const pm of packageManagers) {
    if (await commandExists(pm.name)) {
      console.log(`Attempting to install FFmpeg via ${pm.name}...`);
      const success = await runShellCommand(pm.command);
      if (success) return true;
    }
  }
  return false;
}

async function tryAutoInstallFFmpeg() {
  if (process.platform === "win32") {
    return installFFmpegOnWindows();
  }
  if (process.platform === "linux") {
    return installFFmpegOnLinux();
  }
  return false;
}

function getManualInstallMessage() {
  if (process.platform === "win32") {
    return 'FFmpeg is required to start the local decoder. Please install it via https://ffmpeg.org or by running "winget install FFmpeg.FFmpeg" in PowerShell, then restart Raffi.';
  }
  if (process.platform === "darwin") {
    return 'FFmpeg is required to start the local decoder. Install it via Homebrew ("brew install ffmpeg") or from https://ffmpeg.org, then restart Raffi.';
  }
  return 'FFmpeg is required to start the local decoder. Install it with your package manager (for example: "sudo apt install ffmpeg") or from https://ffmpeg.org, then restart Raffi.';
}

function getLibx264InstallMessage() {
  if (process.platform === "win32") {
    return 'FFmpeg is installed but missing the libx264 encoder. Please reinstall FFmpeg with x264 support from https://ffmpeg.org or via "winget install FFmpeg.FFmpeg", then restart Raffi.';
  }
  if (process.platform === "darwin") {
    return 'FFmpeg is installed but missing the libx264 encoder. Reinstall via Homebrew ("brew reinstall ffmpeg") to get x264 support, then restart Raffi.';
  }
  // Linux - provide distro-specific instructions
  return `FFmpeg is installed but missing the libx264 encoder (needed for video transcoding).

For Fedora/RHEL: Enable RPM Fusion and run "sudo dnf install ffmpeg x264"
For Ubuntu/Debian: Run "sudo apt install ffmpeg libavcodec-extra"
For Arch: Run "sudo pacman -S ffmpeg x264"

After installing, restart Raffi.`;
}

async function ensureFFmpegAvailable() {
  const ffmpegInstalled = await hasFFmpeg();
  
  if (!ffmpegInstalled) {
    const installed = await tryAutoInstallFFmpeg();
    if (!installed || !(await hasFFmpeg())) {
      await dialog.showMessageBox({
        type: "error",
        buttons: ["Quit"],
        title: "FFmpeg Required",
        message: "FFmpeg was not found on this system.",
        detail: getManualInstallMessage(),
      });
      return false;
    }
  }

  // Check for libx264 encoder
  if (!(await hasLibx264())) {
    await dialog.showMessageBox({
      type: "error",
      buttons: ["Quit"],
      title: "libx264 Encoder Required",
      message: "FFmpeg is missing the libx264 encoder.",
      detail: getLibx264InstallMessage(),
    });
    return false;
  }

  return true;
}

function createWindow() {
  const isWindows = process.platform === "win32";
  const isMac = process.platform === "darwin";
  const isLinux = process.platform === "linux";
  logToFile("Creating main window");

  // Window frame configuration per platform:
  // - Windows: uses titleBarOverlay for custom controls
  // - macOS: uses hidden titleBarStyle for traffic lights
  // - Linux: uses standard frame (hidden titleBarStyle causes issues on many DEs)
  const windowOptions = {
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    minHeight: 800,
    minWidth: 1200,
    autoHideMenuBar: true,
    backgroundColor: "#090909",
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  };

  if (isWindows) {
    windowOptions.frame = false;
    windowOptions.titleBarStyle = "hidden";
    windowOptions.titleBarOverlay = {
      color: "#00000000",
      symbolColor: "#ffffff",
      height: 32,
    };
  } else if (isMac) {
    windowOptions.frame = true;
    windowOptions.titleBarStyle = "hidden";
    windowOptions.titleBarOverlay = {
      color: "#00000000",
      symbolColor: "#ffffff",
      height: 32,
    };
  } else {
    // Linux: use standard frame to avoid compatibility issues
    windowOptions.frame = true;
    const linuxIconCandidates = [
      "/usr/share/icons/hicolor/512x512/apps/raffi.png",
      "/usr/share/icons/hicolor/128x128/apps/raffi.png",
      path.join(process.resourcesPath || "", "icon.png"),
    ];
    const iconPath = linuxIconCandidates.find((candidate) => candidate && fs.existsSync(candidate));
    if (iconPath) {
      windowOptions.icon = iconPath;
    }
  }

  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.on("maximize", () => {
    try {
      mainWindow.webContents.send("WINDOW_MAXIMIZED_CHANGED", true);
    } catch {
      // ignore
    }
  });
  mainWindow.on("unmaximize", () => {
    try {
      mainWindow.webContents.send("WINDOW_MAXIMIZED_CHANGED", false);
    } catch {
      // ignore
    }
  });

  mainWindow.on("enter-full-screen", () => {
    try {
      mainWindow.webContents.send("WINDOW_FULLSCREEN_CHANGED", true);
    } catch {
      // ignore
    }
  });
  mainWindow.on("leave-full-screen", () => {
    try {
      mainWindow.webContents.send("WINDOW_FULLSCREEN_CHANGED", false);
    } catch {
      // ignore
    }
  });

  try {
    const primary = screen.getPrimaryDisplay();
    const workArea = primary?.workAreaSize;
    if (
      workArea &&
      (workArea.width < DEFAULT_WINDOW_WIDTH ||
        workArea.height < DEFAULT_WINDOW_HEIGHT)
    ) {
      mainWindow.maximize();
    }
  } catch (e) {
    console.warn("Error maximizing window on small screens:", e);
  }

  // Dev: load Vite dev server
  // Prod: serve built dist via Express on localhost (doing this all because of youtube iframe)
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    const serializeUpdateInfo = (info) => {
      if (!info) return null;
      const rawNotes = info.releaseNotes;
      let notes = "";
      if (typeof rawNotes === "string") {
        notes = rawNotes;
      } else if (Array.isArray(rawNotes)) {
        notes = rawNotes
          .map((note) => note?.note || note?.notes || "")
          .join("\n");
      }
      return {
        version: info.version || info.releaseName || null,
        releaseDate: info.releaseDate || null,
        notes,
      };
    };

    if (autoUpdater) {
      autoUpdater.autoInstallOnAppQuit = false;

      autoUpdater.on("error", (err) => {
        logToFile("autoUpdater error", err);
      });

      autoUpdater.on("update-available", (info) => {
        logToFile("Update available", info);
        const payload = serializeUpdateInfo(info);
        if (payload && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("UPDATE_AVAILABLE", payload);
        }
      });

      autoUpdater.on("update-not-available", (info) => {
        logToFile("Update not available", info);
      });

      autoUpdater.on("update-downloaded", (info) => {
        logToFile("Update downloaded", info);
        const payload = serializeUpdateInfo(info);
        pendingUpdateInfo = payload;
        if (payload && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("UPDATE_DOWNLOADED", payload);
        }
      });

      autoUpdater.checkForUpdates().catch((err) => {
        logToFile("checkForUpdates failed", err);
      });
    } else {
      logToFile("autoUpdater not available");
    }

    const expressApp = express();
    const distPath = path.join(__dirname, "..", "dist");
    expressApp.use(express.static(distPath));

    httpServer = expressApp.listen(11420, "127.0.0.1", () => {
      console.log(`Serving app on http://127.0.0.1:11420`);
      logToFile("Serving app on http://127.0.0.1:11420");
      mainWindow.loadURL(`http://127.0.0.1:11420`);
    });

    httpServer.on("error", (err) => {
      logToFile("Failed to start express server", err);
    });
  }

  mainWindow.setMenuBarVisibility(false);

  const applyDisplayZoom = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const { width, height } = mainWindow.getBounds();

    if (height < 1000) {
      mainWindow.setAspectRatio(16 / 9);
    } else {
      mainWindow.setAspectRatio(0);
    }

    const primary = screen.getPrimaryDisplay();
    const scaleFactor = primary?.scaleFactor || 1;
    const dpiZoom = 1 / scaleFactor;

    const effectiveWidth = width / dpiZoom;

    // For large screens (>= 1600px effective width), don't apply poster-grid optimization
    // Just use DPI scaling only
    if (effectiveWidth >= WIDTH_THRESHOLD) {
      mainWindow.webContents.send("display-zoom", dpiZoom);
      return;
    }

    // Smart zoom algorithm for smaller screens: Find optimal zoom for poster grid layouts
    // Poster widths are typically 180-200px, with gaps of ~20px
    // We want to fit as many full posters as possible without awkward gaps
    const posterWidth = 200; // Base poster width
    const posterGap = 20; // Gap between posters

    let bestZoom = dpiZoom;
    let bestWaste = Infinity;

    // Try different zoom levels to find the one with minimal wasted space
    const zoomSteps = 100;
    for (let i = 0; i <= zoomSteps; i++) {
      const testZoom = MIN_ZOOM + (MAX_ZOOM - MIN_ZOOM) * (i / zoomSteps);
      const scaledWidth = effectiveWidth / testZoom;
      
      // Calculate how many posters fit at this zoom level
      const postersPerRow = Math.floor((scaledWidth + posterGap) / (posterWidth + posterGap));
      if (postersPerRow < 3) continue; // Need at least 3 posters per row
      
      // Calculate wasted space (gap on the right)
      const usedWidth = postersPerRow * posterWidth + (postersPerRow - 1) * posterGap;
      const wastedSpace = scaledWidth - usedWidth;
      const wasteRatio = wastedSpace / scaledWidth;
      
      // Prefer zoom levels with less waste (< 15% waste is good)
      if (wasteRatio < bestWaste) {
        bestWaste = wasteRatio;
        bestZoom = testZoom * dpiZoom;
      }
      
      // If we found a near-perfect fit, use it
      if (wasteRatio < 0.05) break;
    }

    // Apply additional width-based scaling for very narrow windows
    const widthZoom = effectiveWidth < WIDTH_THRESHOLD ? effectiveWidth / WIDTH_THRESHOLD : 1;
    const finalZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, bestZoom * widthZoom));

    mainWindow.webContents.setZoomFactor(1);
    try {
      mainWindow.webContents.send("DISPLAY_ZOOM", finalZoom);
    } catch (e) {
      console.warn("Failed to send display zoom", e);
    }
  };

  mainWindow.webContents.on("did-finish-load", () => {
    applyDisplayZoom();
    if (fileToOpen) {
      mainWindow.webContents.send("open-file", fileToOpen);
      fileToOpen = null;
    }
    if (pendingAveAuthPayload) {
      mainWindow.webContents.send("AVE_AUTH_CALLBACK", pendingAveAuthPayload);
      pendingAveAuthPayload = null;
    }
  });
  mainWindow.on("resize", applyDisplayZoom);
  screen.on("display-metrics-changed", applyDisplayZoom);

  mainWindow.on("ready-to-show", () => {
    logToFile("Main window ready-to-show");
  });

  mainWindow.on("show", () => {
    logToFile("Main window shown");
  });

  mainWindow.on("close", () => {
    logToFile("Main window close requested");
  });

  mainWindow.on("closed", () => {
    logToFile("Main window closed");
  });

  mainWindow.webContents.on("did-fail-load", (_event, code, desc, url) => {
    logToFile(`Main window failed to load (${code}) ${desc}`, url);
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    logToFile("Renderer process gone", details);
  });
}

ipcMain.on("WINDOW_MINIMIZE", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.minimize();
});

ipcMain.on("WINDOW_TOGGLE_MAXIMIZE", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on("WINDOW_CLOSE", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.close();
});

ipcMain.handle("WINDOW_IS_MAXIMIZED", async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  return mainWindow.isMaximized();
});

ipcMain.on("WINDOW_TOGGLE_FULLSCREEN", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
});

ipcMain.handle("WINDOW_IS_FULLSCREEN", async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  return mainWindow.isFullScreen();
});

ipcMain.handle("OPEN_EXTERNAL_URL", async (_event, targetUrl) => {
  if (!targetUrl || typeof targetUrl !== "string") {
    throw new Error("Invalid URL");
  }
  await shell.openExternal(targetUrl);
  return true;
});

ipcMain.handle("UPDATE_INSTALL", async () => {
  if (!autoUpdater) return { ok: false, reason: "autoUpdater unavailable" };
  logToFile("Update install requested");
  cleanup();
  setTimeout(() => {
    try {
      autoUpdater.quitAndInstall(false, true);
    } catch (err) {
      logToFile("Failed to quit and install update", err);
    }
  }, 500);
  return { ok: true };
});

async function startGoServer() {
  const binPath = getDecoderPath();
  console.log("Binary path:", binPath);
  logToFile("Decoder binary path", binPath);

  // Check if binary exists
  if (!fs.existsSync(binPath)) {
    const err = `Decoder binary not found at ${binPath}`;
    logToFile(err);
    console.error(err);
    throw new Error(err);
  }

  // Ensure executable permissions on Linux/Mac
  await ensureDecoderExecutable(binPath);

  logToFile("Spawning decoder process");
  
  goServer = spawn(binPath, [], { stdio: "pipe" });

  logToFile(`Decoder process spawned, pid: ${goServer.pid}`);

  goServer.on("error", (err) => {
    logToFile("Decoder spawn error", err);
    console.error("Decoder spawn error:", err);
  });

  goServer.on("exit", (code, signal) => {
    logToFile(`Decoder exited with code ${code} signal ${signal}`);
    console.log(`Decoder exited with code ${code} signal ${signal}`);
  });

  goServer.stdout.on("data", (d) => {
    const msg = d.toString();
    console.log("[go]", msg);
    logToFile("[go stdout]", msg);
  });
  
  goServer.stderr.on("data", (d) => {
    const msg = d.toString();
    console.error("[go err]", msg);
    logToFile("[go stderr]", msg);
  });
}

ipcMain.handle("SAVE_CLIP_DIALOG", async (_event, suggestedName) => {
  try {
    const defaultName =
      suggestedName && typeof suggestedName === "string"
        ? suggestedName
        : "clip.mp4";
    const res = await dialog.showSaveDialog(mainWindow, {
      title: "Save Clip",
      defaultPath: defaultName,
      filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
    });
    return { canceled: res.canceled, filePath: res.filePath || null };
  } catch (e) {
    return { canceled: true, filePath: null, error: String(e) };
  }
});

ipcMain.handle("LOCAL_LIBRARY_PICK_FOLDER", async () => {
  if (!mainWindow) return null;
  const res = await dialog.showOpenDialog(mainWindow, {
    title: "Select Library Folder",
    properties: ["openDirectory"],
  });
  if (res.canceled) return null;
  const folder = res.filePaths && res.filePaths[0];
  return folder || null;
});

ipcMain.handle("LOCAL_LIBRARY_SCAN", async (_event, roots) => {
  try {
    if (!Array.isArray(roots)) return [];
    // Defensive: avoid scanning crazy inputs
    const sanitized = roots
      .filter((r) => typeof r === "string")
      .map((r) => r.trim())
      .filter(Boolean)
      .slice(0, 20);

    return await scanLibraryRoots(sanitized);
  } catch (e) {
    console.error("LOCAL_LIBRARY_SCAN failed:", e);
    return [];
  }
});

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
      registerLinuxProtocolHandler();
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
  const ffmpegReady = await ensureFFmpegAvailable();

  if (!ffmpegReady) {
    logToFile("FFmpeg missing; quitting");
    app.quit();
    return;
  }

  logToFile("Starting decoder server");
  try {
    await startGoServer();
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
  const decoderReady = await waitForDecoderReady();
  
  if (!decoderReady) {
    logToFile("Decoder server failed to start, but creating window anyway");
    console.error("WARNING: Decoder server not responding, app may not work properly");
    // Don't block the window from opening - just show a warning
    createWindow();
    return;
  }

  logToFile("Decoder server ready, creating window");
  createWindow();
});

function cleanup() {
  console.log("Cleaning up...");
  if (goServer) {
    console.log("Killing Go server...");
    goServer.kill("SIGTERM");
    setTimeout(() => {
      if (goServer && !goServer.killed) {
        goServer.kill("SIGKILL");
      }
    }, 1000);
  }
  if (httpServer) {
    console.log("Closing HTTP server...");
    httpServer.close();
  }
}

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

// --- Discord RPC ---
const { DiscordRPCClient } = require("@ryuziii/discord-rpc");

const clientId = "1443935459079094396";
let rpc;
let rpcEnabled = true;
let rpcConnected = false;
let rpcConnectPromise = null;
let lastRpcConnectAttemptAt = 0;
let pendingActivity = null;

const RPC_CONNECT_COOLDOWN_MS = 15_000;

function applyActivity(data) {
  if (!rpc || !rpcConnected) return;

  try {
    if (data.useProgressBar && data.duration > 0) {
      const options = {
        state: data.state,
        largeImageKey: data.largeImageKey || "raffi_logo",
        largeImageText: data.largeImageText || "Raffi",
        smallImageKey: data.smallImageKey || "play",
        smallImageText: data.smallImageText || "Playing",
      };

      rpc.setProgressBar(data.details, data.duration, options);
    } else {
      rpc.setActivity({
        state: data.state,
        largeImageKey: data.largeImageKey || "raffi_logo",
        largeImageText: data.largeImageText || "Raffi",
        smallImageKey: data.smallImageKey || "play",
        smallImageText: data.smallImageText || "Playing",
      });
    }
  } catch (err) {
    console.log("RPC_SET_ACTIVITY error:", err);
  }
}

function createRPCClient() {
  const client = new DiscordRPCClient({
    clientId,
    transport: "ipc",
  });

  // IMPORTANT: discord-rpc emits 'error' when Discord isn't running.
  // If nobody listens for it, Node treats it as an uncaught exception.
  client.on("error", (err) => {
    // Swallow connection errors (e.g. ENOENT \\.\\pipe\\discord-ipc-0).
    // Keep the app running even if Discord isn't installed/running.
    console.log("Discord RPC error (ignored):", err?.message || err);
    destroyRPC();
  });

  return client;
}

function initRPC() {
  if (!rpcEnabled) return;
  if (rpcConnected) return;

  const now = Date.now();
  if (rpcConnectPromise) return;
  if (now - lastRpcConnectAttemptAt < RPC_CONNECT_COOLDOWN_MS) return;
  lastRpcConnectAttemptAt = now;

  if (!rpc) {
    rpc = createRPCClient();
  }

  rpcConnectPromise = rpc
    .connect()
    .then(() => {
      rpcConnected = true;
      rpcConnectPromise = null;
      if (pendingActivity) {
        const next = pendingActivity;
        pendingActivity = null;
        applyActivity(next);
      }
    })
    .catch((err) => {
      rpcConnectPromise = null;
      rpcConnected = false;

      if (isDiscordIPCConnectError(err)) {
        rpcEnabled = false;
        pendingActivity = null;
      }
      destroyRPC();
    });
}

function destroyRPC() {
  if (!rpc) return;
  try {
    rpcConnected = false;
    rpcConnectPromise = null;
    try {
      rpc.removeAllListeners?.();
    } catch (e) {}
    rpc.destroy();
  } catch (e) {}
  rpc = null;
}

initRPC();

ipcMain.on("RPC_SET_ACTIVITY", (event, data) => {
  if (!rpcEnabled) return;

  pendingActivity = data;
  if (!rpcConnected) {
    initRPC();
    return;
  }

  applyActivity(data);
});

ipcMain.on("RPC_CLEAR_ACTIVITY", () => {
  pendingActivity = null;
  if (!rpc || !rpcConnected) return;
  try {
    rpc.clearActivity();
  } catch (err) {
    console.log("RPC_CLEAR_ACTIVITY error:", err);
  }
});

ipcMain.on("RPC_ENABLE", () => {
  rpcEnabled = true;
  initRPC();
});

ipcMain.on("RPC_DISABLE", () => {
  rpcEnabled = false;
  destroyRPC();
});
