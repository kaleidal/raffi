function registerMainIpcHandlers({
  ipcMain,
  dialog,
  shell,
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
