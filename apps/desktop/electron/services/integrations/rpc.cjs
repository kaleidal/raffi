const { DiscordIpcClient } = require("./discordIpc.cjs");

const CLIENT_ID = "1443935459079094396";
const MIN_UPDATE_INTERVAL_MS = 4_100;
const MAX_RECONNECT_DELAY_MS = 60_000;

function text(value) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, 128) : undefined;
}

function httpsUrl(value) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    const normalized = url.toString();
    return url.protocol === "https:" && normalized.length <= 512
      ? normalized
      : undefined;
  } catch {
    return undefined;
  }
}

function unixTimestamp(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function normalizeActivity(value) {
  const details = text(value?.details);
  const state = text(value?.state);
  const largeImage = httpsUrl(value?.largeImageKey) || text(value?.largeImageKey);
  const smallImage = httpsUrl(value?.smallImageKey) || text(value?.smallImageKey);
  const buttons = Array.isArray(value?.buttons)
    ? value.buttons
        .map((button) => ({
          label: text(button?.label)?.slice(0, 32),
          url: httpsUrl(button?.url),
        }))
        .filter((button) => button.label && button.url)
        .slice(0, 2)
    : [];
  const start = unixTimestamp(value?.startTimestamp);
  const end = unixTimestamp(value?.endTimestamp);
  const activity = {
    type: [0, 2, 3, 5].includes(value?.type) ? value.type : 3,
    status_display_type: [0, 1, 2].includes(value?.statusDisplayType)
      ? value.statusDisplayType
      : undefined,
    details,
    state,
    instance: false,
    buttons: buttons.length ? buttons : undefined,
    timestamps: start || end ? { start, end } : undefined,
    assets: largeImage || smallImage
      ? {
          large_image: largeImage,
          large_text: text(value?.largeImageText),
          small_image: smallImage,
          small_text: text(value?.smallImageText),
        }
      : undefined,
  };
  return JSON.parse(JSON.stringify(activity));
}

function registerDiscordRpcHandlers({ ipcMain }) {
  let enabled = true;
  let desiredActivity = null;
  let reconnectDelay = 2_000;
  let reconnectTimer = null;
  let updateTimer = null;
  let lastUpdateAt = 0;
  let lastPayload = "";

  const client = new DiscordIpcClient({
    clientId: CLIENT_ID,
    onDisconnect: () => scheduleReconnect(),
    onError: (error) => console.warn("Discord RPC:", error.message),
  });

  function clearTimer(name) {
    const timer = name === "reconnect" ? reconnectTimer : updateTimer;
    if (timer) clearTimeout(timer);
    if (name === "reconnect") reconnectTimer = null;
    else updateTimer = null;
  }

  function scheduleReconnect() {
    if (!enabled || !desiredActivity || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
  }

  async function connect() {
    if (!enabled || !desiredActivity || client.ready) return;
    try {
      await client.connect();
      reconnectDelay = 2_000;
      flushActivity(true);
    } catch {
      scheduleReconnect();
    }
  }

  function flushActivity(force = false) {
    clearTimer("update");
    if (!enabled || !desiredActivity) return;
    if (!client.ready) {
      void connect();
      return;
    }
    const payload = JSON.stringify(desiredActivity);
    if (!force && payload === lastPayload) return;
    const wait = MIN_UPDATE_INTERVAL_MS - (Date.now() - lastUpdateAt);
    if (!force && wait > 0) {
      updateTimer = setTimeout(() => flushActivity(), wait);
      return;
    }
    try {
      client.setActivity(desiredActivity);
      lastPayload = payload;
      lastUpdateAt = Date.now();
    } catch {
      scheduleReconnect();
    }
  }

  ipcMain.on("RPC_SET_ACTIVITY", (_event, value) => {
    if (!enabled) return;
    desiredActivity = normalizeActivity(value);
    flushActivity();
  });

  ipcMain.on("RPC_CLEAR_ACTIVITY", () => {
    desiredActivity = null;
    lastPayload = "";
    clearTimer("update");
    clearTimer("reconnect");
    if (client.ready) {
      try {
        client.clearActivity();
      } catch {
      }
    }
  });

  ipcMain.on("RPC_ENABLE", () => {
    enabled = true;
    flushActivity();
  });

  ipcMain.on("RPC_DISABLE", () => {
    enabled = false;
    desiredActivity = null;
    lastPayload = "";
    clearTimer("update");
    clearTimer("reconnect");
    if (client.ready) {
      try {
        client.clearActivity();
      } catch {
      }
    }
    client.destroy();
  });

  return {
    destroyRPC() {
      clearTimer("update");
      clearTimer("reconnect");
      client.destroy();
    },
  };
}

module.exports = {
  normalizeActivity,
  registerDiscordRpcHandlers,
};
