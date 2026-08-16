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
  getDefenderExclusionStatus,
  applyDefenderExclusions,
  scanLibraryRoots,
  net,
}) {
  const pathModule = require("path");
  const os = require("os");
  const allowedClipSaveTargets = new Set();

  async function resolveRealPath(candidate) {
    const resolved = pathModule.resolve(candidate);
    try {
      return await fs.promises.realpath(resolved);
    } catch {
      const parent = pathModule.dirname(resolved);
      const base = pathModule.basename(resolved);
      try {
        const realParent = await fs.promises.realpath(parent);
        return pathModule.join(realParent, base);
      } catch {
        return resolved;
      }
    }
  }

  function isPathInside(candidate, parentDir) {
    const relative = pathModule.relative(parentDir, candidate);
    return (
      relative === "" ||
      (Boolean(relative) &&
        !relative.startsWith("..") &&
        !pathModule.isAbsolute(relative))
    );
  }

  function hasPathEscape(value) {
    return /(^|[\\/])\.\.([\\/]|$)/.test(value);
  }

  async function getAllowedClipSourceDirs() {
    const dirs = [
      pathModule.join(os.tmpdir(), "raffi", "clips"),
    ];
    try {
      const { app } = require("electron");
      dirs.push(pathModule.join(app.getPath("userData"), "clips"));
      dirs.push(pathModule.join(app.getPath("appData"), "Raffi", "clips"));
    } catch {
      // ignore
    }
    const resolved = [];
    for (const dir of dirs) {
      try {
        await fs.promises.mkdir(dir, { recursive: true });
        resolved.push(await fs.promises.realpath(dir));
      } catch {
        resolved.push(pathModule.resolve(dir));
      }
    }
    return resolved;
  }

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

  ipcMain.handle("LIMBO_API_DISCOVERY_READ", async () => {
    const { readLimboApiDiscovery } = require("./limboDiscovery.cjs");
    return readLimboApiDiscovery(fs);
  });

  ipcMain.handle("DEFENDER_EXCLUSION_STATUS", async () => {
    if (typeof getDefenderExclusionStatus !== "function") {
      return {
        supported: false,
        excluded: false,
        paths: [],
        processes: [],
        missingPaths: [],
        missingProcesses: [],
        error: "Unavailable",
      };
    }
    return getDefenderExclusionStatus();
  });

  ipcMain.handle("DEFENDER_APPLY_EXCLUSIONS", async () => {
    if (typeof applyDefenderExclusions !== "function") {
      return { ok: false, elevated: false, error: "Unavailable" };
    }
    return applyDefenderExclusions();
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

  ipcMain.handle("PREFLIGHT_STREAM", async (_event, payload) => {
    const rawUrl = typeof payload?.url === "string" ? payload.url.trim() : "";
    const parsed = new URL(rawUrl);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error("Invalid stream URL");
    }

    const timeoutMs = Math.max(1000, Math.min(Number(payload?.timeoutMs) || 3500, 8000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await net.fetch(parsed.toString(), {
        method: "GET",
        headers: { Range: "bytes=0-1", "Cache-Control": "no-cache" },
        signal: controller.signal,
      });
      await response.body?.cancel();
      const contentRange = response.headers.get("content-range") || "";
      const rangeTotal = contentRange.match(/\/\s*(\d+)\s*$/)?.[1];
      const contentLength = response.headers.get("content-length");
      const totalBytes = rangeTotal
        ? Number(rangeTotal)
        : response.status === 200 && contentLength
          ? Number(contentLength)
          : null;
      return {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get("content-type") || "",
        totalBytes: Number.isSafeInteger(totalBytes) && totalBytes > 0 ? totalBytes : null,
      };
    } catch (error) {
      if (controller.signal.aborted) {
        return { ok: false, status: 0, contentType: "", timedOut: true };
      }
      return { ok: false, status: 0, contentType: "", networkError: true };
    } finally {
      clearTimeout(timer);
    }
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
      if (!res.canceled && res.filePath) {
        const normalized = pathModule.resolve(res.filePath);
        allowedClipSaveTargets.add(normalized);
        try {
          allowedClipSaveTargets.add(await resolveRealPath(normalized));
        } catch {
          // keep resolved path only
        }
      }
      return { canceled: res.canceled, filePath: res.filePath || null };
    } catch (e) {
      return { canceled: true, filePath: null, error: String(e) };
    }
  });

  ipcMain.handle("WRITE_CLIP_FILE", async (_event, payload) => {
    try {
      const targetPath = typeof payload?.targetPath === "string" ? payload.targetPath.trim() : "";
      const data = payload?.data;
      if (!targetPath) {
        throw new Error("Invalid clip target path");
      }
      if (hasPathEscape(targetPath)) {
        throw new Error("Path traversal is not allowed");
      }
      if (!data || !(data instanceof ArrayBuffer || ArrayBuffer.isView(data))) {
        throw new Error("Invalid clip data");
      }

      const resolvedTarget = pathModule.resolve(targetPath);
      let realTarget = resolvedTarget;
      try {
        realTarget = await resolveRealPath(resolvedTarget);
      } catch {
        // file may not exist yet
      }

      const targetAllowed =
        allowedClipSaveTargets.has(resolvedTarget) ||
        allowedClipSaveTargets.has(realTarget);
      if (!targetAllowed) {
        throw new Error("Clip target path was not selected via Save dialog");
      }

      const targetDir = pathModule.dirname(resolvedTarget);
      await fs.promises.mkdir(targetDir, { recursive: true });
      const bytes =
        data instanceof ArrayBuffer
          ? Buffer.from(data)
          : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
      await fs.promises.writeFile(resolvedTarget, bytes);

      allowedClipSaveTargets.delete(resolvedTarget);
      allowedClipSaveTargets.delete(realTarget);

      return { ok: true, filePath: resolvedTarget };
    } catch (error) {
      logToFile("WRITE_CLIP_FILE failed", error);
      return { ok: false, filePath: null, error: String(error) };
    }
  });

  ipcMain.handle("FETCH_COMMUNITY_ADDONS", async () => {
    const upstreams = [
      "https://api.strem.io/addonscollection.json",
      "https://stremio-addons.com/catalog.json",
    ];
    const merged = [];
    let lastError = null;

    for (const url of upstreams) {
      try {
        const response = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(25_000),
        });
        if (!response.ok) {
          lastError = new Error(`upstream ${url} returned ${response.status}`);
          continue;
        }
        const json = await response.json();
        if (Array.isArray(json)) {
          merged.push(...json);
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (merged.length === 0) {
      return {
        ok: false,
        addons: [],
        error: lastError ? String(lastError) : "failed to fetch community addons",
      };
    }

    const seen = new Set();
    const deduped = [];
    for (const raw of merged) {
      if (!raw || typeof raw !== "object") continue;
      const transport =
        (typeof raw.transportUrl === "string" && raw.transportUrl.trim()) ||
        (typeof raw.transport_url === "string" && raw.transport_url.trim()) ||
        "";
      let key = transport;
      if (!key && raw.manifest && typeof raw.manifest.id === "string") {
        key = raw.manifest.id.trim();
      }
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(raw);
    }

    return { ok: true, addons: deduped, error: null };
  });

  ipcMain.handle("PERSIST_CLIP_FILE", async (_event, payload) => {
    try {
      const sourcePath = typeof payload?.sourcePath === "string" ? payload.sourcePath.trim() : "";
      const targetPath = typeof payload?.targetPath === "string" ? payload.targetPath.trim() : "";

      if (!sourcePath || !targetPath) {
        throw new Error("Invalid clip file paths");
      }
      if (hasPathEscape(sourcePath) || hasPathEscape(targetPath)) {
        throw new Error("Path traversal is not allowed");
      }

      const realSource = await resolveRealPath(sourcePath);
      const realTarget = await resolveRealPath(targetPath);
      const resolvedTarget = pathModule.resolve(targetPath);

      const allowedSources = await getAllowedClipSourceDirs();
      const sourceAllowed = allowedSources.some((dir) => isPathInside(realSource, dir));
      if (!sourceAllowed) {
        throw new Error("Clip source path is outside the allowed clips directory");
      }

      const targetAllowed =
        allowedClipSaveTargets.has(resolvedTarget) ||
        allowedClipSaveTargets.has(realTarget);
      if (!targetAllowed) {
        throw new Error("Clip target path was not selected via Save dialog");
      }

      const targetDir = pathModule.dirname(realTarget);
      await fs.promises.mkdir(targetDir, { recursive: true });

      try {
        await fs.promises.rename(realSource, realTarget);
      } catch {
        await fs.promises.copyFile(realSource, realTarget);
        await fs.promises.unlink(realSource).catch(() => {});
      }

      allowedClipSaveTargets.delete(resolvedTarget);
      allowedClipSaveTargets.delete(realTarget);

      return { ok: true, filePath: realTarget };
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
