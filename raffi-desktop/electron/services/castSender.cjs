function createCastSenderService({ logToFile, BrowserWindow, shell, fs, path, baseDir }) {
  const ChromecastAPI = require("chromecast-api");
  const CastV2Client = require("castv2-client").Client;
  const DefaultMediaReceiver = require("castv2-client").DefaultMediaReceiver;

  let senderWindow = null;
  let senderReadyPromise = null;
  let legacyClient = null;
  let legacyDevicePromise = null;
  let activeLegacyDevice = null;
  let nativeCastClient = null;
  let nativeCastPlayer = null;
  const discoveredDevices = new Map();

  let activeMediaUrl = "";
  let activeDeviceName = "";
  let activeDeviceId = "google-cast";
  let activeTransport = "";
  let nativeLastKnownTimeSeconds = 0;
  let nativeLastKnownAtMs = 0;
  let nativeIsPlaying = false;
  let chromeLastKnownTimeSeconds = 0;
  let chromeLastKnownAtMs = 0;
  let chromeIsPlaying = false;

  const senderBridgeUrl = "https://raffi.al/cast/sender.html";
  const defaultReceiverAppId = "29330CDE";

  function normalizeDevice(device) {
    return {
      id: String(device?.name || device?.friendlyName || device?.host || "chromecast-device"),
      name: String(device?.friendlyName || device?.name || "Chromecast"),
      host: String(device?.host || ""),
    };
  }

  function getLegacyClient() {
    if (legacyClient) return legacyClient;
    legacyClient = new ChromecastAPI();
    legacyClient.on("device", (device) => {
      const normalized = normalizeDevice(device);
      discoveredDevices.set(normalized.id, { device, normalized });
    });
    return legacyClient;
  }

  function callDevice(device, method, ...args) {
    return new Promise((resolve, reject) => {
      if (!device || typeof device[method] !== "function") {
        reject(new Error(`legacy_device_method_missing:${method}`));
        return;
      }

      device[method](...args, (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      });
    });
  }

  function callNativePlayer(method, ...args) {
    return new Promise((resolve, reject) => {
      if (!nativeCastPlayer || typeof nativeCastPlayer[method] !== "function") {
        reject(new Error(`native_cast_player_method_missing:${method}`));
        return;
      }
      nativeCastPlayer[method](...args, (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      });
    });
  }

  function callNativeClient(method, ...args) {
    return new Promise((resolve, reject) => {
      if (!nativeCastClient || typeof nativeCastClient[method] !== "function") {
        reject(new Error(`native_cast_client_method_missing:${method}`));
        return;
      }
      nativeCastClient[method](...args, (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      });
    });
  }

  async function closeNativeCastConnection() {
    if (nativeCastPlayer) {
      try {
        await callNativePlayer("stop");
      } catch {
        // ignore
      }
    }
    if (nativeCastClient) {
      try {
        nativeCastClient.close();
      } catch {
        // ignore
      }
    }
    nativeCastPlayer = null;
    nativeCastClient = null;
  }

  async function discoverLegacyDevice(timeoutMs = 6000, preferredDeviceId = "") {
    const preferredId = String(preferredDeviceId || "").trim();

    if (preferredId) {
      const exact = discoveredDevices.get(preferredId);
      if (exact?.device) {
        return exact.device;
      }
    }

    if (activeLegacyDevice) {
      return activeLegacyDevice;
    }

    if (discoveredDevices.size > 0) {
      if (preferredId) {
        const matched = Array.from(discoveredDevices.values()).find((entry) => {
          const normalized = entry?.normalized;
          return normalized && (
            normalized.id === preferredId ||
            normalized.host === preferredId ||
            normalized.name === preferredId
          );
        });
        if (matched?.device) {
          return matched.device;
        }
      }
      const first = discoveredDevices.values().next().value;
      if (first?.device) {
        return first.device;
      }
    }

    const client = getLegacyClient();
    if (legacyDevicePromise) {
      return legacyDevicePromise;
    }

    legacyDevicePromise = new Promise((resolve, reject) => {
      const done = (device, error) => {
        client.removeListener("device", onDevice);
        if (timer) {
          clearTimeout(timer);
        }
        legacyDevicePromise = null;
        if (error) {
          reject(error);
          return;
        }
        resolve(device);
      };

      const onDevice = (device) => {
        if (!preferredId) {
          done(device);
          return;
        }
        const normalized = normalizeDevice(device);
        if (
          normalized.id === preferredId ||
          normalized.host === preferredId ||
          normalized.name === preferredId
        ) {
          done(device);
        }
      };
      const timer = setTimeout(() => {
        if (preferredId) {
          done(null, new Error(`Requested Cast device not found: ${preferredId}`));
          return;
        }
        done(null, new Error("No Cast devices found by native discovery"));
      }, Math.max(2000, Number(timeoutMs || 0)));

      client.on("device", onDevice);
      try {
        if (typeof client.update === "function") {
          client.update();
        }
      } catch (error) {
        done(null, error);
      }
    });

    return legacyDevicePromise;
  }

  function buildLegacyMedia({ streamUrl, metadata }) {
    const coverUrl = String(metadata?.cover || metadata?.background || "").trim();
    const media = {
      url: String(streamUrl || ""),
      contentType: "application/vnd.apple.mpegurl",
      streamType: "BUFFERED",
      cover: {
        title: String(metadata?.title || "Raffi"),
        subtitle: String(metadata?.subtitle || ""),
        url: coverUrl,
      },
    };
    const durationSeconds = Number(metadata?.durationSeconds || 0);
    if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
      media.duration = durationSeconds;
    }
    return media;
  }

  function parseLegacyCurrentTime(value) {
    if (Number.isFinite(Number(value))) {
      return Number(value);
    }

    if (value && typeof value === "object") {
      const maybeCurrent = Number(value.currentTime ?? value.current_time ?? value.time);
      if (Number.isFinite(maybeCurrent)) {
        return maybeCurrent;
      }
    }

    return null;
  }

  function parseLegacyPlayerState(value) {
    if (!value || typeof value !== "object") {
      return "UNKNOWN";
    }

    const direct = String(value.playerState || value.state || "").trim();
    if (direct) {
      return direct.toUpperCase();
    }

    const mediaState = String(value.media?.playerState || value.media?.state || "").trim();
    if (mediaState) {
      return mediaState.toUpperCase();
    }

    return "UNKNOWN";
  }

  async function connectAndLoadNativeLegacy({ streamUrl, startTime = 0, metadata, deviceId = "" }) {
    const device = await discoverLegacyDevice(7000, deviceId);
    const host = String(device?.host || "").trim();
    if (!host) {
      throw new Error("Selected Cast device host is unavailable");
    }

    await closeNativeCastConnection();

    const castClient = new CastV2Client();
    nativeCastClient = castClient;

    await new Promise((resolve, reject) => {
      castClient.connect(host, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(true);
      });
    });

    const player = await new Promise((resolve, reject) => {
      castClient.launch(DefaultMediaReceiver, (error, launchedPlayer) => {
        if (error || !launchedPlayer) {
          reject(error || new Error("Failed to launch DefaultMediaReceiver"));
          return;
        }
        resolve(launchedPlayer);
      });
    });

    nativeCastPlayer = player;

    const media = buildLegacyMedia({ streamUrl, metadata });
    const startAt = Math.max(0, Number(startTime || 0));

    await callNativePlayer("load", {
      contentId: media.url,
      contentType: media.contentType,
      streamType: media.streamType,
      duration: media.duration,
      metadata: {
        type: 0,
        metadataType: 0,
        title: media.cover.title,
        subtitle: media.cover.subtitle,
        images: media.cover.url ? [{ url: media.cover.url }] : [],
      },
    }, {
      autoplay: true,
      currentTime: startAt,
    });

    activeLegacyDevice = device;
    activeMediaUrl = streamUrl;
    activeDeviceName = String(device?.friendlyName || device?.name || "Chromecast");
    activeDeviceId = String(device?.name || device?.host || "google-cast");
    activeTransport = "native";
    nativeLastKnownTimeSeconds = startAt;
    nativeLastKnownAtMs = Date.now();
    nativeIsPlaying = true;

    return {
      active: true,
      deviceId: activeDeviceId,
      mediaUrl: activeMediaUrl,
      deviceName: activeDeviceName,
      transport: activeTransport,
    };
  }

  function getWindowsChromiumCandidates() {
    return [
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
      "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    ];
  }

  async function openBrowserFallback({ appId, streamUrl, startTime, metadata, reason }) {
    const target = new URL(senderBridgeUrl);
    target.searchParams.set("mode", "standalone");
    target.searchParams.set("receiverAppId", String(appId || defaultReceiverAppId));
    target.searchParams.set("streamUrl", String(streamUrl || ""));
    target.searchParams.set("startTime", String(Math.max(0, Number(startTime || 0))));
    target.searchParams.set("title", String(metadata?.title || "Raffi"));
    target.searchParams.set("subtitle", String(metadata?.subtitle || ""));
    target.searchParams.set("cover", String(metadata?.cover || ""));
    target.searchParams.set("background", String(metadata?.background || ""));
    target.searchParams.set("reason", String(reason || "electron_no_devices"));
    const targetUrl = target.toString();

    if (process.platform === "win32" && fs?.existsSync) {
      const { spawn } = require("child_process");
      const candidates = getWindowsChromiumCandidates();
      for (const executablePath of candidates) {
        if (!fs.existsSync(executablePath)) {
          continue;
        }
        try {
          const child = spawn(executablePath, [targetUrl], {
            detached: true,
            stdio: "ignore",
          });
          child.unref();
          return { opened: true, method: `chromium:${executablePath}` };
        } catch (error) {
          logToFile("Failed launching Chromium candidate for Cast fallback", {
            executablePath,
            error: String(error?.message || error || "unknown_error"),
          });
        }
      }
    }

    if (!shell?.openExternal) {
      return { opened: false, method: "none" };
    }

    await shell.openExternal(targetUrl);
    return { opened: true, method: "shell_openExternal" };
  }

  function createSenderWindow() {
    if (senderWindow && !senderWindow.isDestroyed()) {
      return senderWindow;
    }

    senderWindow = new BrowserWindow({
      width: 460,
      height: 300,
      show: false,
      title: "Cast Device Picker",
      autoHideMenuBar: true,
      minimizable: false,
      maximizable: false,
      resizable: false,
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });

    senderWindow.on("closed", () => {
      senderWindow = null;
      senderReadyPromise = null;
    });

    return senderWindow;
  }

  async function ensureSenderReady() {
    if (senderReadyPromise) {
      return senderReadyPromise;
    }

    senderReadyPromise = (async () => {
      const win = createSenderWindow();
      await win.loadURL(senderBridgeUrl);

      const hasBridge = await win.webContents.executeJavaScript(
        "Boolean(window.__raffiCastBridge)",
        false,
      );

      if (!hasBridge) {
        throw new Error("Cast bridge did not initialize");
      }

      logToFile("Cast sender bridge ready", { url: senderBridgeUrl });
      return true;
    })();

    try {
      await senderReadyPromise;
      return true;
    } catch (error) {
      senderReadyPromise = null;
      throw error;
    }
  }

  async function reloadSenderBridge() {
    const win = createSenderWindow();
    await win.loadURL(senderBridgeUrl);
    const hasBridge = await win.webContents.executeJavaScript(
      "Boolean(window.__raffiCastBridge)",
      false,
    );
    if (!hasBridge) {
      throw new Error("Cast bridge did not initialize after reload");
    }
    senderReadyPromise = Promise.resolve(true);
    logToFile("Cast sender bridge reloaded", { url: senderBridgeUrl });
    return true;
  }

  async function invokeBridge(method, payload, withUserGesture = false) {
    await ensureSenderReady();
    if (!senderWindow || senderWindow.isDestroyed()) {
      throw new Error("Cast sender window unavailable");
    }

    const currentWindow = senderWindow;

    const bridgePayload = payload || {};
    const script = `(() => {
      const bridge = window.__raffiCastBridge;
      if (!bridge || typeof bridge[${JSON.stringify(method)}] !== 'function') {
        return Promise.resolve({ ok: false, error: 'bridge_method_missing' });
      }
      return Promise.resolve(bridge[${JSON.stringify(method)}](${JSON.stringify(bridgePayload)}))
        .then((result) => ({ ok: true, result }))
        .catch((error) => ({ ok: false, error: String(error && (error.message || error)) }));
    })();`;

    const execPromise = currentWindow.webContents.executeJavaScript(script, withUserGesture);
    const closePromise = new Promise((_, reject) => {
      const onClosed = () => {
        reject(new Error("cast_picker_closed"));
      };
      currentWindow.once("closed", onClosed);
      execPromise.finally(() => {
        currentWindow.removeListener("closed", onClosed);
      });
    });
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error("cast_bridge_timeout"));
      }, 45000);
    });

    const response = await Promise.race([execPromise, closePromise, timeoutPromise]);
    if (!response?.ok) {
      throw new Error(String(response?.error || "cast_bridge_error"));
    }
    return response.result;
  }

  async function listDevices(timeoutMs = 3500) {
    try {
      const client = getLegacyClient();
      if (typeof client.update === "function") {
        client.update();
      }
    } catch {
      // ignore
    }

    const waitMs = Math.max(500, Number(timeoutMs || 0));
    if (discoveredDevices.size === 0) {
      try {
        await discoverLegacyDevice(waitMs);
      } catch {
        // ignore, we'll return whatever is discovered
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, Math.min(1200, waitMs)));
    }

    return Array.from(discoveredDevices.values()).map((entry) => entry.normalized);
  }

  function buildLoadPayload({ appId, streamUrl, startTime, metadata }) {
    return {
      receiverAppId: appId,
      streamUrl,
      startTime: Math.max(0, Number(startTime || 0)),
      metadata: {
        title: String(metadata?.title || "Raffi"),
        subtitle: String(metadata?.subtitle || ""),
        cover: String(metadata?.cover || ""),
        background: String(metadata?.background || ""),
      },
    };
  }

  async function connectAndLoad({
    deviceId,
    streamUrl,
    startTime = 0,
    metadata,
    mode = "native",
  }) {
    if (!streamUrl || typeof streamUrl !== "string") {
      throw new Error("streamUrl is required");
    }

    const appId = defaultReceiverAppId;
    const normalizedMode = String(mode || "native").toLowerCase();

    if (normalizedMode === "chrome") {
      const fallbackResult = await openBrowserFallback({
        appId,
        streamUrl,
        startTime,
        metadata,
        reason: "explicit_chrome_mode",
      });
      if (!fallbackResult?.opened) {
        throw new Error("Failed to open Chrome casting flow");
      }

      activeMediaUrl = streamUrl;
      activeDeviceName = "Chromecast (Chrome)";
      activeDeviceId = "browser-cast";
      activeTransport = "chrome";
      chromeLastKnownTimeSeconds = Math.max(0, Number(startTime || 0));
      chromeLastKnownAtMs = Date.now();
      chromeIsPlaying = true;

      return {
        active: true,
        deviceId: activeDeviceId,
        mediaUrl: activeMediaUrl,
        deviceName: activeDeviceName,
        transport: activeTransport,
      };
    }

    if (normalizedMode === "native") {
      return connectAndLoadNativeLegacy({ streamUrl, startTime, metadata, deviceId });
    }

    await ensureSenderReady();
    if (senderWindow && !senderWindow.isDestroyed()) {
      if (senderWindow.isMinimized()) {
        senderWindow.restore();
      }
      senderWindow.show();
      senderWindow.focus();
      senderWindow.webContents.focus();
    }

    let status;
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        status = await invokeBridge(
          "loadMedia",
          buildLoadPayload({ appId, streamUrl, startTime, metadata }),
          true,
        );
        lastError = null;
        break;
      } catch (error) {
        const message = String(error?.message || error || "cast_connect_failed");
        lastError = error;

        if (message.includes("cast_picker_closed") || message.includes("interactive_session_cancelled")) {
          throw new Error("cast_picker_cancelled");
        }

        const noDevices = message.includes("NO_DEVICES_AVAILABLE") || message.includes("cast_state:NO_DEVICES_AVAILABLE");
        if (!noDevices) {
          if (message.includes("app_id:29330CDE") && (message.includes("session_error") || message.includes("RECEIVER_UNAVAILABLE"))) {
            throw new Error(
              "session_error (receiver app unavailable). Verify app ID 29330CDE is published, or register this Cast device in Cast Developer Console and wait ~15 minutes.",
            );
          }
          throw error;
        }

        logToFile("Cast no-devices state during connectAndLoad", { attempt, message });
        if (attempt === 0) {
          await reloadSenderBridge();
          if (senderWindow && !senderWindow.isDestroyed()) {
            senderWindow.show();
            senderWindow.focus();
            senderWindow.webContents.focus();
          }
          continue;
        }

        let diagnostics = null;
        try {
          diagnostics = await invokeBridge("diagnoseEnvironment", { receiverAppId: appId }, false);
        } catch (diagnosticError) {
          diagnostics = {
            failed: true,
            reason: String(diagnosticError?.message || diagnosticError || "diagnostic_failed"),
          };
        }

        const customState = String(diagnostics?.customCastState || "UNKNOWN");
        const fallbackState = String(diagnostics?.fallbackCastState || "UNKNOWN");
        const customProbeError = String(diagnostics?.customDetails?.error || "").trim();
        const fallbackProbeError = String(diagnostics?.fallbackDetails?.error || "").trim();
        const sdkAvailability = {
          custom: Boolean(diagnostics?.customDetails?.sdkAvailable),
          fallback: Boolean(diagnostics?.fallbackDetails?.sdkAvailable),
          customNamespace: Boolean(diagnostics?.customDetails?.castNamespaceAvailable),
          fallbackNamespace: Boolean(diagnostics?.fallbackDetails?.castNamespaceAvailable),
          customIsAvailable: Boolean(diagnostics?.customDetails?.castIsAvailable),
          fallbackIsAvailable: Boolean(diagnostics?.fallbackDetails?.castIsAvailable),
        };

        if (customState === "UNKNOWN" && fallbackState === "UNKNOWN") {
          throw new Error(
            `session_error (cast state probe failed in sender runtime). custom_probe_error=${customProbeError || "none"}, fallback_probe_error=${fallbackProbeError || "none"}, sdk=${JSON.stringify(sdkAvailability)}`,
          );
        }

        if (fallbackState !== "NO_DEVICES_AVAILABLE" && customState === "NO_DEVICES_AVAILABLE") {
          throw new Error(
            `session_error (receiver app not available on discovered device). custom_state=${customState}, fallback_state=${fallbackState}, app_id=${appId}`,
          );
        }

        throw new Error(
          `session_error (no Cast devices discovered after retry). custom_state=${customState}, fallback_state=${fallbackState}, custom_probe_error=${customProbeError || "none"}, fallback_probe_error=${fallbackProbeError || "none"}. Try 'Cast via Chrome' from the cast modal.`,
        );
      }
    }

    if (!status) {
      throw lastError || new Error("cast_connect_failed");
    }

    activeMediaUrl = streamUrl;
    activeDeviceName = String(status?.deviceName || "Chromecast");
    activeDeviceId = "google-cast";
    activeTransport = "native";

    if (senderWindow && !senderWindow.isDestroyed()) {
      senderWindow.hide();
    }

    return {
      active: true,
      deviceId: activeDeviceId,
      mediaUrl: activeMediaUrl,
      deviceName: activeDeviceName,
      transport: activeTransport,
    };
  }

  async function play() {
    if (activeTransport === "native") {
      await callNativePlayer("play");
      nativeIsPlaying = true;
      nativeLastKnownAtMs = Date.now();
      return;
    }
    if (activeTransport === "chrome") {
      throw new Error("Cast controls are unavailable for Chrome casting mode");
    }
    await invokeBridge("play", {}, true);
  }

  async function pause() {
    if (activeTransport === "native") {
      await callNativePlayer("pause");
      nativeIsPlaying = false;
      return;
    }
    if (activeTransport === "chrome") {
      throw new Error("Cast controls are unavailable for Chrome casting mode");
    }
    await invokeBridge("pause", {}, true);
  }

  async function stop() {
    if (activeTransport === "native") {
      if (activeLegacyDevice) {
        try {
          await callDevice(activeLegacyDevice, "stop");
        } catch {
          // ignore
        }
      }
      activeMediaUrl = "";
      activeDeviceName = "";
      activeTransport = "";
      activeLegacyDevice = null;
      await closeNativeCastConnection();
      nativeLastKnownTimeSeconds = 0;
      nativeLastKnownAtMs = 0;
      nativeIsPlaying = false;
      return;
    }
    if (activeTransport === "chrome") {
      activeMediaUrl = "";
      activeDeviceName = "";
      activeTransport = "";
      chromeLastKnownTimeSeconds = 0;
      chromeLastKnownAtMs = 0;
      chromeIsPlaying = false;
      return;
    }
    await invokeBridge("stop", {}, true);
    activeMediaUrl = "";
  }

  async function disconnect() {
    if (activeTransport === "native") {
      await closeNativeCastConnection();
      activeMediaUrl = "";
      activeDeviceName = "";
      activeTransport = "";
      activeLegacyDevice = null;
      nativeLastKnownTimeSeconds = 0;
      nativeLastKnownAtMs = 0;
      nativeIsPlaying = false;
      return;
    }
    if (activeTransport === "chrome") {
      activeMediaUrl = "";
      activeDeviceName = "";
      activeTransport = "";
      chromeLastKnownTimeSeconds = 0;
      chromeLastKnownAtMs = 0;
      chromeIsPlaying = false;
      return;
    }
    try {
      await invokeBridge("endSession", { stopCasting: true }, true);
    } catch {
    }
    activeMediaUrl = "";
    activeDeviceName = "";
  }

  async function seek(currentTime) {
    if (activeTransport === "native") {
      const target = Math.max(0, Number(currentTime || 0));
      await callNativePlayer("seek", target);
      nativeLastKnownTimeSeconds = target;
      nativeLastKnownAtMs = Date.now();
      return;
    }
    if (activeTransport === "chrome") {
      throw new Error("Cast controls are unavailable for Chrome casting mode");
    }
    await invokeBridge("seek", { currentTime: Math.max(0, Number(currentTime || 0)) }, true);
  }

  async function setVolume(level) {
    if (activeTransport === "native") {
      const clampedLevel = Math.max(0, Math.min(1, Number(level || 0)));
      await callNativeClient("setVolume", { level: clampedLevel, muted: false });
      return;
    }
    if (activeTransport === "chrome") {
      throw new Error("Cast controls are unavailable for Chrome casting mode");
    }
    const clamped = Math.max(0, Math.min(1, Number(level || 0)));
    await invokeBridge("setVolume", { level: clamped }, true);
  }

  async function getStatus() {
    if (activeTransport === "native" && activeLegacyDevice) {
      const nowMs = Date.now();
      let current = null;
      let playerState = "UNKNOWN";

      if (nativeCastPlayer && typeof nativeCastPlayer.getStatus === "function") {
        try {
          const legacyStatus = await callNativePlayer("getStatus");
          playerState = parseLegacyPlayerState(legacyStatus);
          current = parseLegacyCurrentTime(legacyStatus);
        } catch {
          // fallback to getCurrentTime below
        }
      }

      try {
        if (current == null) {
          const maybeTime = await callNativePlayer("getStatus");
          current = parseLegacyCurrentTime(maybeTime);
          if (playerState === "UNKNOWN") {
            playerState = parseLegacyPlayerState(maybeTime);
          }
        }
      } catch {
        current = null;
      }

      const pausedState = playerState.includes("PAUSE") || playerState.includes("IDLE");
      const playingState = playerState.includes("PLAYING") || playerState.includes("BUFFER");
      if (pausedState) {
        nativeIsPlaying = false;
      } else if (playingState) {
        nativeIsPlaying = true;
      }

      const elapsedSeconds = nativeLastKnownAtMs > 0
        ? Math.max(0, (nowMs - nativeLastKnownAtMs) / 1000)
        : 0;
      const estimatedFromClock = nativeLastKnownTimeSeconds + (nativeIsPlaying ? elapsedSeconds : 0);

      if (current == null) {
        current = estimatedFromClock;
      }

      if (nativeIsPlaying && Number.isFinite(Number(current))) {
        current = Math.max(Number(current), estimatedFromClock);
      }

      nativeLastKnownTimeSeconds = Math.max(0, Number(current || 0));
      nativeLastKnownAtMs = nowMs;

      return {
        active: true,
        deviceId: activeDeviceId,
        mediaUrl: activeMediaUrl,
        playerState,
        currentTime: Number.isFinite(Number(current)) ? Number(current) : 0,
        volumeLevel: 0,
        deviceName: activeDeviceName || "Chromecast",
        transport: activeTransport,
      };
    }

    if (activeTransport === "chrome" && activeMediaUrl) {
      const nowMs = Date.now();
      const elapsedSeconds = chromeLastKnownAtMs > 0
        ? Math.max(0, (nowMs - chromeLastKnownAtMs) / 1000)
        : 0;
      if (chromeIsPlaying) {
        chromeLastKnownTimeSeconds += elapsedSeconds;
      }
      chromeLastKnownAtMs = nowMs;

      return {
        active: true,
        deviceId: activeDeviceId,
        mediaUrl: activeMediaUrl,
        playerState: chromeIsPlaying ? "PLAYING" : "PAUSED",
        currentTime: Math.max(0, chromeLastKnownTimeSeconds),
        volumeLevel: 0,
        deviceName: activeDeviceName || "Chromecast (Chrome)",
        transport: activeTransport,
      };
    }

    const status = await invokeBridge("getStatus", { receiverAppId: defaultReceiverAppId });
    if (!status?.active) {
      return { active: false };
    }

    return {
      active: true,
      deviceId: activeDeviceId,
      mediaUrl: activeMediaUrl,
      playerState: String(status?.playerState || "UNKNOWN"),
      currentTime: Number(status?.currentTime || 0),
      volumeLevel: Number(status?.volumeLevel || 0),
      deviceName: String(status?.deviceName || activeDeviceName || "Chromecast"),
      transport: activeTransport || "native",
      raw: status,
    };
  }

  async function shutdown() {
    try {
      await disconnect();
    } catch {
    }

    await closeNativeCastConnection();

    if (senderWindow && !senderWindow.isDestroyed()) {
      senderWindow.close();
    }
    senderWindow = null;
    senderReadyPromise = null;
  }

  return {
    listDevices,
    connectAndLoad,
    play,
    pause,
    stop,
    disconnect,
    seek,
    setVolume,
    getStatus,
    shutdown,
  };
}

module.exports = {
  createCastSenderService,
};
