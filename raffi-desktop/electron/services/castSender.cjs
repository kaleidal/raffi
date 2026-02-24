function createCastSenderService({ logToFile, BrowserWindow, shell, path, baseDir }) {
  let senderWindow = null;
  let senderReadyPromise = null;

  let activeMediaUrl = "";
  let activeDeviceName = "";
  let activeDeviceId = "google-cast";

  const senderBridgeUrl = "https://raffi.al/cast/sender.html";
  const defaultReceiverAppId = "29330CDE";

  async function openBrowserFallback({ appId, streamUrl, startTime, metadata, reason }) {
    if (!shell?.openExternal) {
      return false;
    }
    const target = new URL(senderBridgeUrl);
    target.searchParams.set("mode", "standalone");
    target.searchParams.set("receiverAppId", String(appId || defaultReceiverAppId));
    target.searchParams.set("streamUrl", String(streamUrl || ""));
    target.searchParams.set("startTime", String(Math.max(0, Number(startTime || 0))));
    target.searchParams.set("title", String(metadata?.title || "Raffi"));
    target.searchParams.set("subtitle", String(metadata?.subtitle || ""));
    target.searchParams.set("cover", String(metadata?.cover || ""));
    target.searchParams.set("reason", String(reason || "electron_no_devices"));
    await shell.openExternal(target.toString());
    return true;
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

  async function listDevices() {
    return [];
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
      },
    };
  }

  async function connectAndLoad({
    streamUrl,
    startTime = 0,
    metadata,
  }) {
    if (!streamUrl || typeof streamUrl !== "string") {
      throw new Error("streamUrl is required");
    }

    const appId = defaultReceiverAppId;

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

        let browserFallbackOpened = false;
        try {
          browserFallbackOpened = await openBrowserFallback({
            appId,
            streamUrl,
            startTime,
            metadata,
            reason: "no_devices_available_in_electron",
          });
        } catch (fallbackError) {
          logToFile("Cast browser fallback open failed", fallbackError);
        }

        throw new Error(
          `session_error (no Cast devices discovered after retry). custom_state=${customState}, fallback_state=${fallbackState}, custom_probe_error=${customProbeError || "none"}, fallback_probe_error=${fallbackProbeError || "none"}, browser_fallback_opened=${browserFallbackOpened}.`,
        );
      }
    }

    if (!status) {
      throw lastError || new Error("cast_connect_failed");
    }

    activeMediaUrl = streamUrl;
    activeDeviceName = String(status?.deviceName || "Chromecast");

    if (senderWindow && !senderWindow.isDestroyed()) {
      senderWindow.hide();
    }

    return {
      active: true,
      deviceId: activeDeviceId,
      mediaUrl: activeMediaUrl,
      deviceName: activeDeviceName,
    };
  }

  async function play() {
    await invokeBridge("play", {}, true);
  }

  async function pause() {
    await invokeBridge("pause", {}, true);
  }

  async function stop() {
    await invokeBridge("stop", {}, true);
    activeMediaUrl = "";
  }

  async function disconnect() {
    try {
      await invokeBridge("endSession", { stopCasting: true }, true);
    } catch {
    }
    activeMediaUrl = "";
    activeDeviceName = "";
  }

  async function seek(currentTime) {
    await invokeBridge("seek", { currentTime: Math.max(0, Number(currentTime || 0)) }, true);
  }

  async function setVolume(level) {
    const clamped = Math.max(0, Math.min(1, Number(level || 0)));
    await invokeBridge("setVolume", { level: clamped }, true);
  }

  async function getStatus() {
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
      raw: status,
    };
  }

  async function shutdown() {
    try {
      await disconnect();
    } catch {
    }

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
