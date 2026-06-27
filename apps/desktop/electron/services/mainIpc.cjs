const dns = require("dns").promises;
const http = require("http");
const https = require("https");
const net = require("net");
const { Readable } = require("stream");

const IPTV_MAX_REDIRECTS = 5;
const IPTV_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const IPTV_BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "loopback",
  "broadcasthost",
  "metadata",
  "metadata.google.internal",
  "instance-data",
  "instance-data.ec2.internal",
]);
const IPTV_BLOCKED_HOSTNAME_SUFFIXES = [
  ".localhost",
  ".metadata.google.internal",
];
const iptvBlockedAddressList = new net.BlockList();
iptvBlockedAddressList.addSubnet("0.0.0.0", 8, "ipv4");
iptvBlockedAddressList.addSubnet("127.0.0.0", 8, "ipv4");
iptvBlockedAddressList.addSubnet("169.254.0.0", 16, "ipv4");
iptvBlockedAddressList.addSubnet("224.0.0.0", 4, "ipv4");
iptvBlockedAddressList.addSubnet("240.0.0.0", 4, "ipv4");
iptvBlockedAddressList.addSubnet("::", 96, "ipv6");
iptvBlockedAddressList.addAddress("::", "ipv6");
iptvBlockedAddressList.addAddress("::1", "ipv6");
iptvBlockedAddressList.addSubnet("fe80::", 10, "ipv6");
iptvBlockedAddressList.addSubnet("ff00::", 8, "ipv6");

function createAbortError() {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

function normalizeIptvHostname(hostname) {
  let normalized = String(hostname || "").trim().toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }
  return normalized.replace(/\.+$/, "");
}

function isBlockedIptvHostname(hostname) {
  const normalized = normalizeIptvHostname(hostname);
  return (
    IPTV_BLOCKED_HOSTNAMES.has(normalized) ||
    IPTV_BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  );
}

function isBlockedIptvAddress(address) {
  const normalized = normalizeIptvHostname(address);
  const version = net.isIP(normalized);
  if (!version) return true;
  return iptvBlockedAddressList.check(normalized, version === 4 ? "ipv4" : "ipv6");
}

function parseIptvFetchUrl(target) {
  let parsed;

  try {
    parsed = new URL(target);
  } catch {
    throw new Error("Enter a valid IPTV URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http/https IPTV URLs are supported");
  }

  if (!normalizeIptvHostname(parsed.hostname)) {
    throw new Error("Enter a valid IPTV URL");
  }

  return parsed;
}

async function assertSafeIptvFetchUrl(parsed) {
  const hostname = normalizeIptvHostname(parsed.hostname);

  if (isBlockedIptvHostname(hostname)) {
    throw new Error("IPTV URL host is not allowed");
  }

  if (net.isIP(hostname)) {
    if (isBlockedIptvAddress(hostname)) {
      throw new Error("IPTV URL host is not allowed");
    }
    return [{ address: hostname, family: net.isIP(hostname) }];
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, {
      all: true,
      verbatim: true,
    });
  } catch {
    throw new Error("IPTV URL host could not be resolved");
  }

  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new Error("IPTV URL host could not be resolved");
  }

  for (const entry of addresses) {
    if (isBlockedIptvAddress(entry.address)) {
      throw new Error("IPTV URL host is not allowed");
    }
  }

  return addresses.map((entry) => ({
    address: entry.address,
    family: entry.family,
  }));
}

function getIptvFetchPort(parsed) {
  if (parsed.port) return parsed.port;
  return parsed.protocol === "https:" ? "443" : "80";
}

function getIptvFetchAuth(parsed) {
  if (!parsed.username && !parsed.password) return undefined;
  return `${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`;
}

function headersFromNodeHeaders(nodeHeaders) {
  const headers = new Headers();

  for (const [name, value] of Object.entries(nodeHeaders)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
      continue;
    }

    if (value !== undefined) {
      headers.set(name, String(value));
    }
  }

  return headers;
}

function fetchIptvUrlAtResolvedAddress(parsed, resolvedAddress, signal) {
  const client = parsed.protocol === "https:" ? https : http;
  const hostname = normalizeIptvHostname(parsed.hostname);

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    let settled = false;
    let request;
    const cleanupRequestAbort = () => {
      signal?.removeEventListener?.("abort", onRequestAbort);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanupRequestAbort();
      reject(error);
    };
    const onRequestAbort = () => {
      request?.destroy(createAbortError());
    };

    request = client.request(
      {
        protocol: parsed.protocol,
        hostname: resolvedAddress.address,
        port: getIptvFetchPort(parsed),
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        auth: getIptvFetchAuth(parsed),
        headers: {
          Host: parsed.host,
        },
        servername: parsed.protocol === "https:" && !net.isIP(hostname) ? hostname : undefined,
      },
      (incoming) => {
        if (settled) {
          incoming.destroy();
          return;
        }

        settled = true;
        cleanupRequestAbort();

        const onBodyAbort = () => {
          incoming.destroy(createAbortError());
        };
        if (signal?.aborted) {
          incoming.destroy(createAbortError());
        } else if (signal) {
          signal.addEventListener("abort", onBodyAbort, { once: true });
          incoming.once("close", () => {
            signal.removeEventListener("abort", onBodyAbort);
          });
        }

        const status = incoming.statusCode || 500;
        const body = [204, 205, 304].includes(status) ? null : Readable.toWeb(incoming);
        resolve(
          new Response(body, {
            status,
            statusText: incoming.statusMessage,
            headers: headersFromNodeHeaders(incoming.headers),
          }),
        );
      },
    );

    request.once("error", fail);
    signal?.addEventListener?.("abort", onRequestAbort, { once: true });
    request.end();
  });
}

async function getSafeIptvFetchResponse(initialUrl, signal) {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= IPTV_MAX_REDIRECTS; redirectCount += 1) {
    const resolvedAddresses = await assertSafeIptvFetchUrl(currentUrl);
    let response;
    let lastFetchError;

    for (const resolvedAddress of resolvedAddresses) {
      try {
        response = await fetchIptvUrlAtResolvedAddress(currentUrl, resolvedAddress, signal);
        break;
      } catch (error) {
        lastFetchError = error;
        if (error?.name === "AbortError") {
          throw error;
        }
      }
    }

    if (!response) {
      throw lastFetchError || new Error("IPTV URL host could not be reached");
    }

    if (!IPTV_REDIRECT_STATUSES.has(response.status)) {
      return { response, url: currentUrl };
    }

    if (redirectCount >= IPTV_MAX_REDIRECTS) {
      await response.body?.cancel?.().catch(() => {});
      throw new Error("IPTV redirect limit exceeded");
    }

    const location = response.headers.get("location");
    await response.body?.cancel?.().catch(() => {});

    if (!location) {
      throw new Error("IPTV redirect did not include a target");
    }

    currentUrl = parseIptvFetchUrl(new URL(location, currentUrl).toString());
  }

  throw new Error("IPTV redirect limit exceeded");
}

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
  getDecoderStatus,
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

  ipcMain.handle("DECODER_STATUS_GET", async () => {
    if (typeof getDecoderStatus !== "function") return null;
    return getDecoderStatus();
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

  ipcMain.handle("IPTV_FETCH_TEXT", async (_event, payload) => {
    const target = typeof payload?.url === "string" ? payload.url.trim() : "";
    const initialUrl = parseIptvFetchUrl(target);

    const timeoutMs = Math.min(
      Math.max(Number(payload?.options?.timeoutMs) || 30000, 1000),
      120000,
    );
    const maxBytes = Math.min(
      Math.max(Number(payload?.options?.maxBytes) || 64 * 1024 * 1024, 1024),
      128 * 1024 * 1024,
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const { response, url: responseUrl } = await getSafeIptvFetchResponse(
        initialUrl,
        controller.signal,
      );
      const responseHost = normalizeIptvHostname(responseUrl.hostname);

      if (!response.ok) {
        await response.body?.cancel?.().catch(() => {});
        logToFile("IPTV fetch failed", {
          host: responseHost,
          status: response.status,
        });
        throw new Error(`Fetch failed with HTTP ${response.status}`);
      }

      const reader = response.body?.getReader?.();
      if (!reader) {
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > maxBytes) {
          await response.body?.cancel?.().catch(() => {});
          throw new Error("IPTV response exceeded maximum size");
        }
        logToFile("IPTV fetch completed", {
          host: responseHost,
          status: response.status,
          bytes: arrayBuffer.byteLength,
        });
        return {
          ok: true,
          status: response.status,
          text: Buffer.from(arrayBuffer).toString("utf8"),
        };
      }

      const chunks = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new Error("IPTV response exceeded maximum size");
        }
        chunks.push(Buffer.from(value));
      }

      logToFile("IPTV fetch completed", {
        host: responseHost,
        status: response.status,
        bytes: totalBytes,
      });

      return {
        ok: true,
        status: response.status,
        text: Buffer.concat(chunks, totalBytes).toString("utf8"),
      };
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("IPTV fetch timed out");
      }
      throw error;
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
