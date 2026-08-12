const crypto = require("node:crypto");
const net = require("node:net");
const path = require("node:path");

const OPCODE_HANDSHAKE = 0;
const OPCODE_FRAME = 1;
const OPCODE_CLOSE = 2;
const OPCODE_PING = 3;
const OPCODE_PONG = 4;
const MAX_FRAME_BYTES = 1024 * 1024;

function encodeFrame(opcode, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  const header = Buffer.allocUnsafe(8);
  header.writeInt32LE(opcode, 0);
  header.writeInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

function discordSocketCandidates(platform = process.platform, env = process.env) {
  if (platform === "win32") {
    return Array.from({ length: 10 }, (_, index) =>
      `\\\\?\\pipe\\discord-ipc-${index}`,
    );
  }

  const roots = [env.XDG_RUNTIME_DIR, env.TMPDIR, env.TMP, env.TEMP, "/tmp"]
    .filter(Boolean);
  const candidates = [];
  for (const root of roots) {
    for (let index = 0; index < 10; index += 1) {
      candidates.push(path.join(root, `discord-ipc-${index}`));
      candidates.push(
        path.join(root, "app", "com.discordapp.Discord", `discord-ipc-${index}`),
      );
      candidates.push(path.join(root, "snap.discord", `discord-ipc-${index}`));
    }
  }
  return [...new Set(candidates)];
}

function openSocket(socketPath, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    const timeout = setTimeout(() => {
      cleanup();
      socket.destroy();
      reject(new Error(`Timed out connecting to ${socketPath}`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeListener("error", onError);
      socket.removeListener("connect", onConnect);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onConnect = () => {
      cleanup();
      socket.setNoDelay(true);
      resolve(socket);
    };
    socket.once("error", onError);
    socket.once("connect", onConnect);
  });
}

class DiscordIpcClient {
  constructor({ clientId, onDisconnect, onError }) {
    this.clientId = clientId;
    this.onDisconnect = onDisconnect;
    this.onError = onError;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.ready = false;
    this.connectPromise = null;
    this.readyResolve = null;
    this.readyReject = null;
    this.destroyed = false;
  }

  connect() {
    if (this.ready) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;
    this.destroyed = false;
    this.connectPromise = this.connectToDiscord().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  async connectToDiscord() {
    let lastError = new Error("Discord IPC is unavailable");
    for (const socketPath of discordSocketCandidates()) {
      if (this.destroyed) throw new Error("Discord IPC client was closed");
      let socket;
      try {
        socket = await openSocket(socketPath, 750);
        if (this.destroyed) {
          socket.destroy();
          throw new Error("Discord IPC client was closed");
        }
        this.attachSocket(socket);
        this.write(OPCODE_HANDSHAKE, { v: 1, client_id: this.clientId });
        await this.waitForReady(5_000);
        return;
      } catch (error) {
        lastError = error;
        if (socket) this.detachSocket(socket);
      }
    }
    throw new Error(`Could not connect to Discord: ${lastError.message}`);
  }

  attachSocket(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.ready = false;
    socket.on("data", (chunk) => this.handleData(socket, chunk));
    socket.on("error", (error) => this.handleSocketError(socket, error));
    socket.on("close", () => this.handleSocketClose(socket));
  }

  waitForReady(timeoutMs) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.readyResolve = null;
        this.readyReject = null;
        reject(new Error("Discord did not complete the IPC handshake"));
      }, timeoutMs);
      this.readyResolve = () => {
        clearTimeout(timeout);
        this.readyResolve = null;
        this.readyReject = null;
        resolve();
      };
      this.readyReject = (error) => {
        clearTimeout(timeout);
        this.readyResolve = null;
        this.readyReject = null;
        reject(error);
      };
    });
  }

  handleData(socket, chunk) {
    if (socket !== this.socket) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 8) {
      const opcode = this.buffer.readInt32LE(0);
      const length = this.buffer.readInt32LE(4);
      if (length < 0 || length > MAX_FRAME_BYTES) {
        socket.destroy(new Error("Discord sent an invalid IPC frame"));
        return;
      }
      if (this.buffer.length < 8 + length) return;
      const body = this.buffer.subarray(8, 8 + length);
      this.buffer = this.buffer.subarray(8 + length);
      try {
        this.handleFrame(opcode, body);
      } catch (error) {
        this.onError(error);
        socket.destroy();
        return;
      }
    }
  }

  handleFrame(opcode, body) {
    if (opcode === OPCODE_PING) {
      this.socket?.write(encodeFrame(OPCODE_PONG, JSON.parse(body.toString())));
      return;
    }
    let payload;
    try {
      payload = JSON.parse(body.toString());
    } catch (error) {
      this.onError(error);
      return;
    }
    if (opcode === OPCODE_CLOSE) {
      this.socket?.destroy(new Error(payload.message || "Discord closed IPC"));
      return;
    }
    if (opcode === OPCODE_FRAME && payload.evt === "READY") {
      this.ready = true;
      this.readyResolve?.();
      return;
    }
    if (opcode === OPCODE_FRAME && payload.evt === "ERROR") {
      this.onError(new Error(payload.data?.message || "Discord rejected an RPC command"));
    }
  }

  handleSocketError(socket, error) {
    if (socket !== this.socket) return;
    if (this.ready) this.onError(error);
  }

  handleSocketClose(socket) {
    if (socket !== this.socket) return;
    const wasReady = this.ready;
    this.socket = null;
    this.ready = false;
    this.buffer = Buffer.alloc(0);
    this.readyReject?.(new Error("Discord closed IPC during handshake"));
    if (wasReady && !this.destroyed) this.onDisconnect();
  }

  setActivity(activity) {
    this.command({ pid: process.pid, activity });
  }

  clearActivity() {
    this.command({ pid: process.pid });
  }

  command(args) {
    if (!this.ready) throw new Error("Discord IPC is not connected");
    this.write(OPCODE_FRAME, {
      cmd: "SET_ACTIVITY",
      args,
      nonce: crypto.randomUUID(),
    });
  }

  write(opcode, payload) {
    if (!this.socket || this.socket.destroyed) {
      throw new Error("Discord IPC socket is unavailable");
    }
    this.socket.write(encodeFrame(opcode, payload));
  }

  detachSocket(socket) {
    if (socket === this.socket) {
      this.socket = null;
      this.ready = false;
      this.buffer = Buffer.alloc(0);
    }
    socket.removeAllListeners();
    socket.destroy();
  }

  destroy() {
    this.destroyed = true;
    this.readyReject?.(new Error("Discord IPC client was closed"));
    if (this.socket) this.detachSocket(this.socket);
  }
}

module.exports = {
  DiscordIpcClient,
  discordSocketCandidates,
  encodeFrame,
};
