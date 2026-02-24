function createMainWindow({
  BrowserWindow,
  screen,
  fs,
  path,
  express,
  isDev,
  autoUpdater,
  logToFile,
  baseDir,
  resourcesPath,
  defaultWindowWidth,
  defaultWindowHeight,
  minZoom,
  maxZoom,
  widthThreshold,
  fileToOpen,
  pendingAveAuthPayload,
  pendingTraktAuthPayload,
  setFileToOpen,
  setPendingAveAuthPayload,
  setPendingTraktAuthPayload,
  setPendingUpdateInfo,
  setHttpServer,
}) {
  const isWindows = process.platform === "win32";
  const isMac = process.platform === "darwin";
  const isLinux = process.platform === "linux";
  logToFile("Creating main window");

  const windowOptions = {
    width: defaultWindowWidth,
    height: defaultWindowHeight,
    minHeight: 800,
    minWidth: 1200,
    autoHideMenuBar: true,
    backgroundColor: "#090909",
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(baseDir, "preload.cjs"),
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
    windowOptions.frame = true;
    const linuxIconCandidates = [
      "/usr/share/icons/hicolor/512x512/apps/raffi.png",
      "/usr/share/icons/hicolor/128x128/apps/raffi.png",
      path.join(resourcesPath || "", "icon.png"),
    ];
    const iconPath = linuxIconCandidates.find((candidate) => candidate && fs.existsSync(candidate));
    if (iconPath) {
      windowOptions.icon = iconPath;
    }
  }

  const mainWindow = new BrowserWindow(windowOptions);

  mainWindow.on("maximize", () => {
    try {
      mainWindow.webContents.send("WINDOW_MAXIMIZED_CHANGED", true);
    } catch {}
  });

  mainWindow.on("unmaximize", () => {
    try {
      mainWindow.webContents.send("WINDOW_MAXIMIZED_CHANGED", false);
    } catch {}
  });

  mainWindow.on("enter-full-screen", () => {
    try {
      mainWindow.webContents.send("WINDOW_FULLSCREEN_CHANGED", true);
    } catch {}
  });

  mainWindow.on("leave-full-screen", () => {
    try {
      mainWindow.webContents.send("WINDOW_FULLSCREEN_CHANGED", false);
    } catch {}
  });

  try {
    const primary = screen.getPrimaryDisplay();
    const workArea = primary?.workAreaSize;
    if (
      workArea &&
      (workArea.width < defaultWindowWidth || workArea.height < defaultWindowHeight)
    ) {
      mainWindow.maximize();
    }
  } catch (e) {
    console.warn("Error maximizing window on small screens:", e);
  }

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
        notes = rawNotes.map((note) => note?.note || note?.notes || "").join("\n");
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
        setPendingUpdateInfo(payload);
        if (payload && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("UPDATE_DOWNLOADED", payload);
        }
      });

      autoUpdater.on("download-progress", (progress) => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        const percent =
          typeof progress?.percent === "number" && Number.isFinite(progress.percent)
            ? Math.max(0, Math.min(100, progress.percent))
            : null;
        mainWindow.webContents.send("UPDATE_DOWNLOAD_PROGRESS", {
          percent,
          bytesPerSecond:
            typeof progress?.bytesPerSecond === "number" ? progress.bytesPerSecond : null,
          transferred: typeof progress?.transferred === "number" ? progress.transferred : null,
          total: typeof progress?.total === "number" ? progress.total : null,
        });
      });

      autoUpdater.checkForUpdates().catch((err) => {
        logToFile("checkForUpdates failed", err);
      });
    } else {
      logToFile("autoUpdater not available");
    }

    const expressApp = express();
    const distPath = path.join(baseDir, "..", "dist");
    expressApp.use(express.static(distPath));

    const httpServer = expressApp.listen(11420, "127.0.0.1", () => {
      console.log("Serving app on http://127.0.0.1:11420");
      logToFile("Serving app on http://127.0.0.1:11420");
      mainWindow.loadURL("http://127.0.0.1:11420");
    });

    setHttpServer(httpServer);

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

    if (effectiveWidth >= widthThreshold) {
      mainWindow.webContents.send("display-zoom", dpiZoom);
      return;
    }

    const posterWidth = 200;
    const posterGap = 20;
    let bestZoom = dpiZoom;
    let bestWaste = Infinity;

    for (let i = 0; i <= 100; i++) {
      const testZoom = minZoom + (maxZoom - minZoom) * (i / 100);
      const scaledWidth = effectiveWidth / testZoom;
      const postersPerRow = Math.floor((scaledWidth + posterGap) / (posterWidth + posterGap));
      if (postersPerRow < 3) continue;

      const usedWidth = postersPerRow * posterWidth + (postersPerRow - 1) * posterGap;
      const wastedSpace = scaledWidth - usedWidth;
      const wasteRatio = wastedSpace / scaledWidth;

      if (wasteRatio < bestWaste) {
        bestWaste = wasteRatio;
        bestZoom = testZoom * dpiZoom;
      }

      if (wasteRatio < 0.05) break;
    }

    const widthZoom = effectiveWidth < widthThreshold ? effectiveWidth / widthThreshold : 1;
    const finalZoom = Math.min(maxZoom, Math.max(minZoom, bestZoom * widthZoom));

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
      setFileToOpen(null);
    }
    if (pendingAveAuthPayload) {
      mainWindow.webContents.send("AVE_AUTH_CALLBACK", pendingAveAuthPayload);
      setPendingAveAuthPayload(null);
    }
    if (pendingTraktAuthPayload) {
      mainWindow.webContents.send("TRAKT_AUTH_CALLBACK", pendingTraktAuthPayload);
      setPendingTraktAuthPayload(null);
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

  return mainWindow;
}

module.exports = {
  createMainWindow,
};
