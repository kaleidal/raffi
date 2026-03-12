function registerMainIpcHandlers({
  ipcMain,
  dialog,
  shell,
  fs,
  autoUpdater,
  isAllowedExternalUrl,
  cleanup,
  logToFile,
  getMainWindow,
  scanLibraryRoots,
}) {
  ipcMain.on("WINDOW_MINIMIZE", () => {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.minimize();
  });

  ipcMain.on("WINDOW_TOGGLE_MAXIMIZE", () => {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });

  ipcMain.on("WINDOW_CLOSE", () => {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.close();
  });

  ipcMain.handle("WINDOW_IS_MAXIMIZED", async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    return mainWindow.isMaximized();
  });

  ipcMain.on("WINDOW_TOGGLE_FULLSCREEN", () => {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  });

  ipcMain.handle("WINDOW_IS_FULLSCREEN", async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    return mainWindow.isFullScreen();
  });

  ipcMain.on("WINDOW_SYNC_MINI_PLAYER_STATE", (_event, payload) => {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.__raffiMiniPlayer?.syncState?.(payload || {});
  });

  ipcMain.on("WINDOW_EXIT_MINI_PLAYER", () => {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.__raffiMiniPlayer?.exit?.({ focus: true });
  });

  ipcMain.handle("WINDOW_IS_MINI_PLAYER", async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    return Boolean(mainWindow.__raffiMiniPlayer?.isActive?.());
  });

  ipcMain.handle("WINDOW_GET_DISPLAY_ZOOM", async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return 1;
    return Number(mainWindow.__raffiGetDisplayZoom?.() ?? 1) || 1;
  });

  ipcMain.handle("INTRODB_FETCH_SEGMENTS", async (_event, payload) => {
    const imdbId = typeof payload?.imdbId === "string" ? payload.imdbId.trim() : "";
    const season = Number(payload?.season);
    const episode = Number(payload?.episode);

    if (!imdbId || !Number.isFinite(season) || !Number.isFinite(episode)) {
      throw new Error("Invalid IntroDB request");
    }

    const params = new URLSearchParams({
      imdb_id: imdbId,
      season: String(season),
      episode: String(episode),
    });

    const response = await fetch(`https://api.introdb.app/segments?${params.toString()}`);
    if (response.status === 404) {
      return { status: 404, data: null };
    }
    if (!response.ok) {
      throw new Error(`IntroDB request failed with ${response.status}`);
    }

    return {
      status: response.status,
      data: await response.json(),
    };
  });

  ipcMain.handle("OPEN_EXTERNAL_URL", async (_event, targetUrl) => {
    if (!targetUrl || typeof targetUrl !== "string") throw new Error("Invalid URL");
    if (!isAllowedExternalUrl(targetUrl)) throw new Error("External URL is not allowed");
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

  ipcMain.handle("SAVE_CLIP_DIALOG", async (_event, suggestedName) => {
    try {
      const mainWindow = getMainWindow();
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

  ipcMain.handle("PERSIST_CLIP_FILE", async (_event, payload) => {
    try {
      const path = require("path");
      const sourcePath = typeof payload?.sourcePath === "string" ? payload.sourcePath.trim() : "";
      const targetPath = typeof payload?.targetPath === "string" ? payload.targetPath.trim() : "";

      if (!sourcePath || !targetPath) {
        throw new Error("Invalid clip file paths");
      }

      const targetDir = path.dirname(targetPath);
      await fs.promises.mkdir(targetDir, { recursive: true });

      try {
        await fs.promises.rename(sourcePath, targetPath);
      } catch {
        await fs.promises.copyFile(sourcePath, targetPath);
        await fs.promises.unlink(sourcePath).catch(() => {});
      }

      return { ok: true, filePath: targetPath };
    } catch (error) {
      logToFile("PERSIST_CLIP_FILE failed", error);
      return { ok: false, filePath: null, error: String(error) };
    }
  });

  ipcMain.handle("SHOW_CONFIRM_DIALOG", async (_event, payload) => {
    try {
      const mainWindow = getMainWindow();
      const message =
        payload && typeof payload.message === "string" && payload.message.trim().length > 0
          ? payload.message
          : "Are you sure?";
      const title =
        payload && typeof payload.title === "string" && payload.title.trim().length > 0
          ? payload.title
          : "Confirm";

      const result = await dialog.showMessageBox(mainWindow, {
        type: "question",
        title,
        message,
        buttons: ["Cancel", "OK"],
        defaultId: 1,
        cancelId: 0,
        noLink: true,
        normalizeAccessKeys: true,
      });

      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        mainWindow.webContents.focus();
      }

      return result.response === 1;
    } catch (error) {
      logToFile("SHOW_CONFIRM_DIALOG failed", error);
      return false;
    }
  });

  ipcMain.handle("SHOW_ALERT_DIALOG", async (_event, payload) => {
    try {
      const mainWindow = getMainWindow();
      const message =
        payload && typeof payload.message === "string" && payload.message.trim().length > 0
          ? payload.message
          : "";
      const title =
        payload && typeof payload.title === "string" && payload.title.trim().length > 0
          ? payload.title
          : "Raffi";

      await dialog.showMessageBox(mainWindow, {
        type: "info",
        title,
        message,
        buttons: ["OK"],
        defaultId: 0,
        noLink: true,
        normalizeAccessKeys: true,
      });

      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        mainWindow.webContents.focus();
      }

      return true;
    } catch (error) {
      logToFile("SHOW_ALERT_DIALOG failed", error);
      return false;
    }
  });

  ipcMain.handle("SHOW_SELECT_DIALOG", async (_event, payload) => {
    try {
      const mainWindow = getMainWindow();
      const title =
        payload && typeof payload.title === "string" && payload.title.trim().length > 0
          ? payload.title
          : "Select";
      const message =
        payload && typeof payload.message === "string" && payload.message.trim().length > 0
          ? payload.message
          : "Choose an option";
      const options = Array.isArray(payload?.options)
        ? payload.options.filter((item) => typeof item === "string" && item.trim().length > 0)
        : [];

      if (options.length === 0) {
        return { canceled: true, selectedIndex: -1 };
      }

      const result = await dialog.showMessageBox(mainWindow, {
        type: "question",
        title,
        message,
        detail: "",
        buttons: ["Cancel", ...options],
        defaultId: 1,
        cancelId: 0,
        noLink: true,
        normalizeAccessKeys: true,
      });

      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        mainWindow.webContents.focus();
      }

      if (result.response === 0) {
        return { canceled: true, selectedIndex: -1 };
      }
      return { canceled: false, selectedIndex: result.response - 1 };
    } catch (error) {
      logToFile("SHOW_SELECT_DIALOG failed", error);
      return { canceled: true, selectedIndex: -1 };
    }
  });

  ipcMain.handle("LOCAL_LIBRARY_PICK_FOLDER", async () => {
    const mainWindow = getMainWindow();
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

}

module.exports = {
  registerMainIpcHandlers,
};
