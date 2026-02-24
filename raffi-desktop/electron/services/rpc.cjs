const { DiscordRPCClient } = require("@ryuziii/discord-rpc");

function registerDiscordRpcHandlers({ ipcMain, isDiscordIPCConnectError }) {
  const clientId = "1443935459079094396";
  const RPC_CONNECT_COOLDOWN_MS = 15_000;

  let rpc;
  let rpcEnabled = true;
  let rpcConnected = false;
  let rpcConnectPromise = null;
  let lastRpcConnectAttemptAt = 0;
  let pendingActivity = null;

  function applyActivity(data) {
    if (!rpc || !rpcConnected) return;

    try {
      if (data.useProgressBar && data.duration > 0) {
        const options = {
          state: data.state,
          largeImageKey: data.largeImageKey || "raffi_logo",
          largeImageText: data.largeImageText || "Raffi",
          smallImageKey: data.smallImageKey || "play",
          smallImageText: data.smallImageText || "Playing",
        };

        rpc.setProgressBar(data.details, data.duration, options);
      } else {
        rpc.setActivity({
          state: data.state,
          largeImageKey: data.largeImageKey || "raffi_logo",
          largeImageText: data.largeImageText || "Raffi",
          smallImageKey: data.smallImageKey || "play",
          smallImageText: data.smallImageText || "Playing",
        });
      }
    } catch (err) {
      console.log("RPC_SET_ACTIVITY error:", err);
    }
  }

  function createRPCClient() {
    const client = new DiscordRPCClient({ clientId, transport: "ipc" });
    client.on("error", (err) => {
      console.log("Discord RPC error (ignored):", err?.message || err);
      destroyRPC();
    });
    return client;
  }

  function initRPC() {
    if (!rpcEnabled || rpcConnected) return;

    const now = Date.now();
    if (rpcConnectPromise) return;
    if (now - lastRpcConnectAttemptAt < RPC_CONNECT_COOLDOWN_MS) return;
    lastRpcConnectAttemptAt = now;

    if (!rpc) rpc = createRPCClient();

    rpcConnectPromise = rpc
      .connect()
      .then(() => {
        rpcConnected = true;
        rpcConnectPromise = null;
        if (pendingActivity) {
          const next = pendingActivity;
          pendingActivity = null;
          applyActivity(next);
        }
      })
      .catch((err) => {
        rpcConnectPromise = null;
        rpcConnected = false;

        if (isDiscordIPCConnectError(err)) {
          rpcEnabled = false;
          pendingActivity = null;
        }
        destroyRPC();
      });
  }

  function destroyRPC() {
    if (!rpc) return;
    try {
      rpcConnected = false;
      rpcConnectPromise = null;
      try {
        rpc.removeAllListeners?.();
      } catch {}
      rpc.destroy();
    } catch {}
    rpc = null;
  }

  initRPC();

  ipcMain.on("RPC_SET_ACTIVITY", (_event, data) => {
    if (!rpcEnabled) return;

    pendingActivity = data;
    if (!rpcConnected) {
      initRPC();
      return;
    }

    applyActivity(data);
  });

  ipcMain.on("RPC_CLEAR_ACTIVITY", () => {
    pendingActivity = null;
    if (!rpc || !rpcConnected) return;
    try {
      rpc.clearActivity();
    } catch (err) {
      console.log("RPC_CLEAR_ACTIVITY error:", err);
    }
  });

  ipcMain.on("RPC_ENABLE", () => {
    rpcEnabled = true;
    initRPC();
  });

  ipcMain.on("RPC_DISABLE", () => {
    rpcEnabled = false;
    destroyRPC();
  });

  return {
    destroyRPC,
  };
}

module.exports = {
  registerDiscordRpcHandlers,
};
