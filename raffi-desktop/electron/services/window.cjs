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
  const MINI_PLAYER_WIDTH = 480;
  const MINI_PLAYER_HEIGHT = 270;
  const MINI_PLAYER_MARGIN = 24;
  const primaryWorkArea = screen.getPrimaryDisplay()?.workArea;
  const initialWidth = Math.min(defaultWindowWidth, primaryWorkArea?.width || defaultWindowWidth);
  const initialHeight = Math.min(defaultWindowHeight, primaryWorkArea?.height || defaultWindowHeight);
  const minWindowWidth = Math.min(1200, primaryWorkArea?.width || 1200);
  const minWindowHeight = Math.min(800, primaryWorkArea?.height || 800);
  logToFile("Creating main window");

  const windowOptions = {
    width: initialWidth,
    height: initialHeight,
    minHeight: minWindowHeight,
    minWidth: minWindowWidth,
    autoHideMenuBar: true,
    backgroundColor: "#090909",
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      backgroundThrottling: false,
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
  let currentDisplayZoom = 1;
  const miniPlayerState = {
    enabled: true,
    canEnter: false,
    active: false,
    restoring: false,
    savedBounds: null,
    wasMaximized: false,
    wasFullScreen: false,
  };

  const emitMiniPlayerChanged = (active) => {
    try {
      mainWindow.webContents.send("WINDOW_MINI_PLAYER_CHANGED", active);
    } catch {}
  };

  const scheduleDisplayZoomRefresh = () => {
    const run = () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      applyDisplayZoom();
    };

    run();
    setImmediate(run);
    setTimeout(run, 80);
    setTimeout(run, 180);
  };

  const applyMiniPlayerDisplayZoom = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    currentDisplayZoom = 1;
    try {
      mainWindow.webContents.send("DISPLAY_ZOOM", currentDisplayZoom);
    } catch {}
  };

  const getMiniPlayerBounds = () => {
    const windowBounds = mainWindow.getBounds();
    const display = screen.getDisplayMatching(windowBounds);
    const workArea = display?.workArea || screen.getPrimaryDisplay().workArea;
    const width = Math.min(MINI_PLAYER_WIDTH, Math.max(320, workArea.width - MINI_PLAYER_MARGIN * 2));
    const height = Math.min(
      MINI_PLAYER_HEIGHT,
      Math.max(180, Math.round(width / (16 / 9))),
    );
    return {
      width,
      height,
      x: Math.round(workArea.x + workArea.width - width - MINI_PLAYER_MARGIN),
      y: Math.round(workArea.y + workArea.height - height - MINI_PLAYER_MARGIN),
    };
  };

  const getRestoreWindowState = () => {
    const savedBounds = miniPlayerState.savedBounds;
    if (!savedBounds) {
      return { bounds: null, maximize: miniPlayerState.wasMaximized };
    }

    const display = screen.getDisplayMatching(savedBounds);
    const workArea = display?.workArea || screen.getPrimaryDisplay().workArea;
    const fitsWorkArea =
      savedBounds.width <= workArea.width &&
      savedBounds.height <= workArea.height &&
      savedBounds.x >= workArea.x &&
      savedBounds.y >= workArea.y &&
      savedBounds.x + savedBounds.width <= workArea.x + workArea.width &&
      savedBounds.y + savedBounds.height <= workArea.y + workArea.height;

    if (miniPlayerState.wasMaximized || !fitsWorkArea) {
      return { bounds: null, maximize: true };
    }

    return {
      bounds: {
        x: Math.max(workArea.x, Math.min(savedBounds.x, workArea.x + workArea.width - savedBounds.width)),
        y: Math.max(workArea.y, Math.min(savedBounds.y, workArea.y + workArea.height - savedBounds.height)),
        width: savedBounds.width,
        height: savedBounds.height,
      },
      maximize: false,
    };
  };

  const exitMiniPlayer = ({ focus = true } = {}) => {
    if (!miniPlayerState.active || miniPlayerState.restoring) return;

    miniPlayerState.restoring = true;
    miniPlayerState.active = false;

    mainWindow.setAlwaysOnTop(false);
    mainWindow.setResizable(true);
    mainWindow.setMinimizable(true);
    mainWindow.setMaximizable(true);
    mainWindow.setFullScreenable(true);
    const activeWorkArea = screen.getDisplayMatching(mainWindow.getBounds())?.workArea || primaryWorkArea;
    mainWindow.setMinimumSize(
      Math.min(1200, activeWorkArea?.width || 1200),
      Math.min(800, activeWorkArea?.height || 800),
    );
    mainWindow.setMaximumSize(0, 0);
    mainWindow.setAspectRatio(0);

    const restoreState = getRestoreWindowState();
    const nextBounds = restoreState.bounds;
    const shouldMaximize = restoreState.maximize;
    const shouldFullscreen = miniPlayerState.wasFullScreen;

    if (nextBounds) {
      mainWindow.setBounds(nextBounds);
    }

    if (shouldMaximize) {
      mainWindow.maximize();
    }

    if (shouldFullscreen) {
      mainWindow.setFullScreen(true);
    }

    miniPlayerState.savedBounds = null;
    miniPlayerState.wasMaximized = false;
    miniPlayerState.wasFullScreen = false;
    miniPlayerState.restoring = false;

    emitMiniPlayerChanged(false);

    if (focus) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.focus();
    }

    scheduleDisplayZoomRefresh();
  };

  const enterMiniPlayer = () => {
    if (
      miniPlayerState.active ||
      !miniPlayerState.enabled ||
      !miniPlayerState.canEnter ||
      mainWindow.isDestroyed()
    ) {
      return;
    }

    miniPlayerState.savedBounds = mainWindow.isMaximized()
      ? mainWindow.getNormalBounds()
      : mainWindow.getBounds();
    miniPlayerState.wasMaximized = mainWindow.isMaximized();
    miniPlayerState.wasFullScreen = mainWindow.isFullScreen();

    const applyMiniPlayerBounds = () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;

      const nextBounds = getMiniPlayerBounds();

      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }

      mainWindow.show();
      mainWindow.setResizable(false);
      mainWindow.setMinimizable(false);
      mainWindow.setMaximizable(false);
      mainWindow.setFullScreenable(false);
      mainWindow.setMinimumSize(nextBounds.width, nextBounds.height);
      mainWindow.setMaximumSize(nextBounds.width, nextBounds.height);
      mainWindow.setAspectRatio(16 / 9);
      mainWindow.setBounds(nextBounds);
      mainWindow.setSize(nextBounds.width, nextBounds.height);
      mainWindow.setPosition(nextBounds.x, nextBounds.y);
      mainWindow.setAlwaysOnTop(true, "floating");
      miniPlayerState.active = true;
      emitMiniPlayerChanged(true);
      applyMiniPlayerDisplayZoom();
      if (typeof mainWindow.showInactive === "function") {
        mainWindow.showInactive();
      } else {
        mainWindow.show();
      }
      try {
        mainWindow.moveTop();
      } catch {}
    };

    if (miniPlayerState.wasFullScreen) {
      mainWindow.setFullScreen(false);
    }

    if (miniPlayerState.wasMaximized) {
      mainWindow.once("unmaximize", () => {
        setImmediate(applyMiniPlayerBounds);
      });
      mainWindow.unmaximize();
      return;
    }

    setImmediate(applyMiniPlayerBounds);
  };

  const syncMiniPlayerState = (payload) => {
    miniPlayerState.enabled = Boolean(payload?.enabled ?? miniPlayerState.enabled);
    miniPlayerState.canEnter = Boolean(payload?.canEnter);

    if (miniPlayerState.active && (!miniPlayerState.enabled || !miniPlayerState.canEnter)) {
      exitMiniPlayer({ focus: true });
    }
  };

  mainWindow.__raffiMiniPlayer = {
    syncState: syncMiniPlayerState,
    exit: exitMiniPlayer,
    isActive: () => miniPlayerState.active,
  };
  mainWindow.__raffiGetDisplayZoom = () => currentDisplayZoom;

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

  mainWindow.on("minimize", (event) => {
    if (miniPlayerState.restoring) return;
    if (miniPlayerState.active) {
      event.preventDefault();
      exitMiniPlayer({ focus: true });
      return;
    }
    if (!miniPlayerState.enabled || !miniPlayerState.canEnter) return;
    event.preventDefault();
    setImmediate(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      enterMiniPlayer();
    });
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

    if (miniPlayerState.active) {
      applyMiniPlayerDisplayZoom();
      return;
    }

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
      currentDisplayZoom = dpiZoom;
      mainWindow.webContents.send("DISPLAY_ZOOM", currentDisplayZoom);
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
    currentDisplayZoom = finalZoom;

    mainWindow.webContents.setZoomFactor(1);
    try {
      mainWindow.webContents.send("DISPLAY_ZOOM", currentDisplayZoom);
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

  mainWindow.on("close", (event) => {
    if (miniPlayerState.active && !miniPlayerState.restoring) {
      event.preventDefault();
      exitMiniPlayer({ focus: true });
      return;
    }
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
