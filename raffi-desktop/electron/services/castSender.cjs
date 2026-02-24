function createCastSenderService({ logToFile, BrowserWindow, path, baseDir }) {
  let senderWindow = null;
  let senderReadyPromise = null;

  let activeMediaUrl = "";
  let activeDeviceName = "";
  let activeDeviceId = "google-cast";

  const senderBridgeUrl =
    String(process.env.RAFFI_CAST_SENDER_URL || "").trim() ||
    "https://raffi.al/cast/sender.html";
  const defaultReceiverAppId =
    String(process.env.RAFFI_CAST_RECEIVER_APP_ID || "").trim() ||
    "29330CDE";

  function getLocalFallbackUrl() {
    return `file://${path.join(baseDir, "cast-sender-host.html")}`;
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
      const urlsToTry = [senderBridgeUrl, getLocalFallbackUrl()];
      let lastError = null;

      for (const url of urlsToTry) {
        try {
          await win.loadURL(url);

          const hasBridge = await win.webContents.executeJavaScript(
            "Boolean(window.__raffiCastBridge)",
            false,
          );

          if (!hasBridge) {
            throw new Error("Cast bridge did not initialize");
          }

          logToFile("Cast sender bridge ready", { url });
          return true;
        } catch (error) {
          lastError = error;
          logToFile("Cast sender bridge load failed", { url, error: String(error) });
        }
      }

      throw lastError || new Error("Failed to load Cast sender bridge");
    })();

    try {
      await senderReadyPromise;
      return true;
    } catch (error) {
      senderReadyPromise = null;
      throw error;
    }
  }

  async function invokeBridge(method, payload, withUserGesture = false) {
    await ensureSenderReady();
    if (!senderWindow || senderWindow.isDestroyed()) {
      throw new Error("Cast sender window unavailable");
    }

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

    const response = await senderWindow.webContents.executeJavaScript(script, withUserGesture);
    if (!response?.ok) {
      throw new Error(String(response?.error || "cast_bridge_error"));
    }
    return response.result;
  }

  function getReceiverAppId(overrideValue) {
    const normalized = String(overrideValue || "").trim();
    return normalized || defaultReceiverAppId;
  }

  async function listDevices() {
    return [];
  }

  async function connectAndLoad({
    streamUrl,
    startTime = 0,
    metadata,
    receiverAppId,
  }) {
    if (!streamUrl || typeof streamUrl !== "string") {
      throw new Error("streamUrl is required");
    }

    const appId = getReceiverAppId(receiverAppId);

    if (senderWindow && !senderWindow.isDestroyed()) {
      senderWindow.show();
      senderWindow.focus();
    }

    const status = await invokeBridge(
      "loadMedia",
      {
        receiverAppId: appId,
        streamUrl,
        startTime: Math.max(0, Number(startTime || 0)),
        metadata: {
          title: String(metadata?.title || "Raffi"),
          subtitle: String(metadata?.subtitle || ""),
          cover: String(metadata?.cover || ""),
        },
      },
      true,
    );

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
