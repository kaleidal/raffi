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
  castBootstrapService,
  castSenderService,
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

  ipcMain.handle("CAST_CREATE_BOOTSTRAP", async (_event, payload) => {
    try {
      if (!castBootstrapService?.createBootstrap) {
        throw new Error("Cast bootstrap service unavailable");
      }
      const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId : "";
      const ttlSeconds = Number(payload?.ttlSeconds || 900);
      return await castBootstrapService.createBootstrap({ sessionId, ttlSeconds });
    } catch (error) {
      logToFile("CAST_CREATE_BOOTSTRAP failed", error);
      throw error;
    }
  });

  ipcMain.handle("CAST_LIST_DEVICES", async (_event, payload) => {
    try {
      if (!castSenderService?.listDevices) {
        throw new Error("Cast sender service unavailable");
      }
      const timeoutMs = Number(payload?.timeoutMs || 3000);
      return await castSenderService.listDevices(timeoutMs);
    } catch (error) {
      logToFile("CAST_LIST_DEVICES failed", error);
      throw error;
    }
  });

  ipcMain.handle("CAST_CONNECT_AND_LOAD", async (_event, payload) => {
    try {
      if (!castSenderService?.connectAndLoad) {
        throw new Error("Cast sender service unavailable");
      }
      return await castSenderService.connectAndLoad(payload || {});
    } catch (error) {
      logToFile("CAST_CONNECT_AND_LOAD failed", error);
      throw error;
    }
  });

  ipcMain.handle("CAST_PLAY", async () => {
    try {
      if (!castSenderService?.play) {
        throw new Error("Cast sender service unavailable");
      }
      await castSenderService.play();
      return true;
    } catch (error) {
      logToFile("CAST_PLAY failed", error);
      throw error;
    }
  });

  ipcMain.handle("CAST_PAUSE", async () => {
    try {
      if (!castSenderService?.pause) {
        throw new Error("Cast sender service unavailable");
      }
      await castSenderService.pause();
      return true;
    } catch (error) {
      logToFile("CAST_PAUSE failed", error);
      throw error;
    }
  });

  ipcMain.handle("CAST_SEEK", async (_event, payload) => {
    try {
      if (!castSenderService?.seek) {
        throw new Error("Cast sender service unavailable");
      }
      await castSenderService.seek(payload?.currentTime);
      return true;
    } catch (error) {
      logToFile("CAST_SEEK failed", error);
      throw error;
    }
  });

  ipcMain.handle("CAST_SET_VOLUME", async (_event, payload) => {
    try {
      if (!castSenderService?.setVolume) {
        throw new Error("Cast sender service unavailable");
      }
      await castSenderService.setVolume(payload?.level);
      return true;
    } catch (error) {
      logToFile("CAST_SET_VOLUME failed", error);
      throw error;
    }
  });

  ipcMain.handle("CAST_STOP", async () => {
    try {
      if (!castSenderService?.stop) {
        throw new Error("Cast sender service unavailable");
      }
      await castSenderService.stop();
      return true;
    } catch (error) {
      logToFile("CAST_STOP failed", error);
      throw error;
    }
  });

  ipcMain.handle("CAST_DISCONNECT", async () => {
    try {
      if (!castSenderService?.disconnect) {
        throw new Error("Cast sender service unavailable");
      }
      await castSenderService.disconnect();
      return true;
    } catch (error) {
      logToFile("CAST_DISCONNECT failed", error);
      throw error;
    }
  });

  ipcMain.handle("CAST_STATUS", async () => {
    try {
      if (!castSenderService?.getStatus) {
        throw new Error("Cast sender service unavailable");
      }
      return await castSenderService.getStatus();
    } catch (error) {
      logToFile("CAST_STATUS failed", error);
      throw error;
    }
  });

  ipcMain.handle("CAST_RELOAD_MEDIA", async (_event, payload) => {
    try {
      if (!castSenderService?.reloadMedia) {
        throw new Error("Cast sender service unavailable");
      }
      return await castSenderService.reloadMedia(payload || {});
    } catch (error) {
      logToFile("CAST_RELOAD_MEDIA failed", error);
      throw error;
    }
  });
}

module.exports = {
  registerMainIpcHandlers,
};
