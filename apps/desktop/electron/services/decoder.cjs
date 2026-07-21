const http = require("http");
const crypto = require("crypto");

function createDecoderService({ isDev, path, fs, spawn, logToFile, baseDir }) {
  let goServer = null;
  let cleanupInProgress = false;
  let decoderSecret = crypto.randomBytes(32).toString("hex");
  let decoderStatus = {
    state: "idle",
    reason: "idle",
    message: "",
    detail: "",
    pid: null,
    updatedAt: Date.now(),
  };
  const statusListeners = new Set();

  function emitStatus() {
    const snapshot = getDecoderStatus();
    for (const listener of statusListeners) {
      try {
        listener(snapshot);
      } catch (err) {
        logToFile("Decoder status listener failed", err);
      }
    }
  }

  function setDecoderStatus(nextStatus) {
    decoderStatus = {
      ...decoderStatus,
      ...nextStatus,
      pid: goServer?.pid ?? null,
      updatedAt: Date.now(),
    };
    emitStatus();
  }

  function getDecoderStatus() {
    return {
      ...decoderStatus,
      pid: goServer?.pid ?? null,
    };
  }

  function getDecoderAuthSecret() {
    return decoderSecret;
  }

  function onDecoderStatusChange(listener) {
    statusListeners.add(listener);
    return () => {
      statusListeners.delete(listener);
    };
  }

  function getBundledToolPath(toolName) {
    const extension = process.platform === "win32" ? ".exe" : "";
    let fileName;
    if (process.platform === "darwin") {
      const suffix = process.arch === "arm64" ? "arm64" : "x64";
      fileName = `${toolName}-${suffix}${extension}`;
    } else {
      fileName = `${toolName}${extension}`;
    }
    const rootDir = isDev ? baseDir : process.resourcesPath;
    return path.join(rootDir, fileName);
  }

  /**
   * Decides whether to use a system binary or the bundled one.
   * Priority:
   *   1. If a good system binary exists on PATH → use it (best on Linux, good on macOS)
   *   2. If the bundled binary we staged exists → use it
   *   3. Fall back to whatever the name resolves to
   */
  function resolveBestBinary(toolName, bundledPath) {
    // Try system first (most reliable when the user has a decent one)
    try {
      const { execSync } = require("child_process");
      const whichCmd = process.platform === "win32" ? "where" : "which";
      const systemPath = execSync(`${whichCmd} ${toolName}`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .split(/\r?\n/)[0]
        .trim();

      if (systemPath && fs.existsSync(systemPath)) {
        return { path: systemPath, source: "system" };
      }
    } catch {
      // which failed or binary not in PATH — that's fine
    }

    if (bundledPath && fs.existsSync(bundledPath)) {
      return { path: bundledPath, source: "bundled" };
    }

    // Final fallback — just use the bare name
    const ext = process.platform === "win32" ? ".exe" : "";
    return { path: toolName + ext, source: "path" };
  }

  function getDecoderServerUrl() {
    const serverAddr = process.env.RAFFI_SERVER_ADDR || "127.0.0.1:6969";
    return serverAddr.startsWith("http") ? serverAddr : `http://${serverAddr}`;
  }

  function getDecoderPath() {
    const platform = process.platform;
    const arch = process.arch;

    if (isDev) {
      if (platform === "win32") {
        return path.join(baseDir, "decoder-windows-amd64.exe");
      }
      if (platform === "darwin") {
        const macBinary = arch === "arm64"
          ? "decoder-aarch64-apple-darwin"
          : "decoder-x86_64-apple-darwin";
        return path.join(baseDir, macBinary);
      }
      return path.join(baseDir, "decoder-x86_64-unknown-linux-gnu");
    }

    if (platform === "win32") {
      return path.join(process.resourcesPath, "decoder-windows-amd64.exe");
    }
    if (platform === "darwin") {
      const macBinary = arch === "arm64"
        ? "decoder-aarch64-apple-darwin"
        : "decoder-x86_64-apple-darwin";
      return path.join(process.resourcesPath, macBinary);
    }
    return path.join(process.resourcesPath, "decoder-x86_64-unknown-linux-gnu");
  }

  async function ensureDecoderExecutable(binPath) {
    if (process.platform !== "win32") {
      try {
        await fs.promises.chmod(binPath, 0o755);
        logToFile(`Set executable permissions on ${binPath}`);
      } catch (err) {
        if (err.code === "EROFS" || err.code === "EPERM") {
          logToFile(`Skipping chmod (${err.code}): ${binPath}`);
        } else {
          logToFile(`Failed to set executable permissions on ${binPath}`, err);
          throw err;
        }
      }
    }
  }

  function readHealthBody(res) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        try {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve(text ? JSON.parse(text) : null);
        } catch (err) {
          reject(err);
        }
      });
      res.on("error", reject);
    });
  }

  async function probeDecoderHealth({ timeoutMs = 500, requireVerified = false } = {}) {
    const serverUrl = getDecoderServerUrl();

    try {
      const body = await new Promise((resolve, reject) => {
        const req = http.get(
          `${serverUrl}/`,
          {
            headers: {
              "X-Raffi-Auth": decoderSecret,
              Accept: "application/json",
            },
          },
          async (res) => {
            try {
              if (!res.statusCode || res.statusCode >= 500) {
                reject(new Error(`Unexpected status code: ${res.statusCode}`));
                return;
              }
              const parsed = await readHealthBody(res);
              resolve({ statusCode: res.statusCode, body: parsed });
            } catch (err) {
              reject(err);
            }
          },
        );
        req.on("error", reject);
        req.setTimeout(timeoutMs, () => {
          req.destroy();
          reject(new Error("Timeout"));
        });
      });

      const isRaffi =
        body?.body &&
        body.body.ok === true &&
        body.body.service === "raffi-decoder";
      const verified = Boolean(body?.body?.verified);

      if (!isRaffi) {
        return { ok: false, reason: "not_raffi" };
      }
      if (requireVerified && !verified) {
        return { ok: false, reason: "unverified", isRaffi: true };
      }
      return { ok: true, verified, isRaffi: true };
    } catch (err) {
      logToFile(`Decoder health check failed`, err);
      return { ok: false, reason: "unreachable", error: err };
    }
  }

  async function isOwnedDecoderHealthy({ timeoutMs = 500 } = {}) {
    const result = await probeDecoderHealth({ timeoutMs, requireVerified: true });
    return result.ok === true && result.verified === true;
  }

  async function waitForDecoderReady(maxRetries = 30, retryDelayMs = 500) {
    for (let i = 0; i < maxRetries; i++) {
      const result = await probeDecoderHealth({ timeoutMs: 1000, requireVerified: true });
      if (result.ok && result.verified) {
        logToFile(`Decoder server ready after ${i + 1} attempts`);
        setDecoderStatus({
          state: "ready",
          reason: "ready",
          message: "",
          detail: "",
        });
        return true;
      }

      if (i === maxRetries - 1) {
        logToFile(`Decoder server not ready after ${maxRetries} attempts`, result);
        if (decoderStatus.state !== "unavailable") {
          setDecoderStatus({
            state: "unavailable",
            reason: "startup_timeout",
            message: "Raffi could not reach its playback server.",
            detail: "The playback server did not respond after waiting a few seconds.",
          });
        }
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }

    return false;
  }

  async function startDecoderServer() {
    const binPath = getDecoderPath();
    const ffmpegPath = getBundledToolPath("ffmpeg");
    const ffprobePath = getBundledToolPath("ffprobe");
    cleanupInProgress = false;

    setDecoderStatus({
      state: "starting",
      reason: "starting",
      message: "Checking existing playback server...",
      detail: "",
    });

    // Only attach if an already-running process proves it is OUR Raffi decoder
    // (health verified with this launch's secret). Prefer spawning an owned process.
    if (goServer && !goServer.killed) {
      const owned = await isOwnedDecoderHealthy({ timeoutMs: 500 });
      if (owned) {
        logToFile("Owned decoder process already running");
        setDecoderStatus({
          state: "ready",
          reason: "already_running",
          message: "",
          detail: "Using the owned Raffi playback server.",
        });
        return;
      }
    }

    const existing = await probeDecoderHealth({ timeoutMs: 500, requireVerified: false });
    if (existing.ok && existing.verified) {
      logToFile("Verified Raffi decoder already running with matching secret; attaching");
      setDecoderStatus({
        state: "ready",
        reason: "already_running",
        message: "",
        detail: "Using a verified Raffi playback server.",
      });
      return;
    }
    if (existing.isRaffi && !existing.verified) {
      logToFile("Foreign or stale Raffi decoder on :6969 — not attaching; preferring owned spawn");
    } else if (existing.reason !== "unreachable") {
      logToFile("Non-Raffi process responded on decoder port — not attaching", existing);
    }

    console.log("Binary path:", binPath);
    logToFile("Decoder binary path", binPath);

    if (!fs.existsSync(binPath)) {
      const err = `Decoder binary not found at ${binPath}`;
      logToFile(err);
      console.error(err);
      setDecoderStatus({
        state: "unavailable",
        reason: "start_failed",
        message: "Raffi could not launch its playback server.",
        detail: err,
      });
      throw new Error(err);
    }

    try {
      await ensureDecoderExecutable(binPath);

      const decoderEnv = {
        ...process.env,
        RAFFI_SERVER_ADDR: process.env.RAFFI_SERVER_ADDR || "127.0.0.1:6969",
        RAFFI_DECODER_SECRET: decoderSecret,
      };

      // Smart resolution (mirrors what the Go server does):
      // Prefer system binaries when they exist and are usable.
      // Only force the bundled ones via env var if we explicitly decide to use them.
      const resolvedFfmpeg = resolveBestBinary("ffmpeg", ffmpegPath);
      const resolvedFfprobe = resolveBestBinary("ffprobe", ffprobePath);

      if (resolvedFfmpeg.source === "bundled") {
        await ensureDecoderExecutable(resolvedFfmpeg.path);
        decoderEnv.RAFFI_FFMPEG_BIN = resolvedFfmpeg.path;
        logToFile("Using bundled ffmpeg", resolvedFfmpeg.path);
      } else {
        logToFile(`Using ${resolvedFfmpeg.source} ffmpeg`, resolvedFfmpeg.path);
      }

      if (resolvedFfprobe.source === "bundled") {
        await ensureDecoderExecutable(resolvedFfprobe.path);
        decoderEnv.RAFFI_FFPROBE_BIN = resolvedFfprobe.path;
        logToFile("Using bundled ffprobe", resolvedFfprobe.path);
      } else {
        logToFile(`Using ${resolvedFfprobe.source} ffprobe`, resolvedFfprobe.path);
      }

      logToFile("Spawning decoder process");
      goServer = spawn(binPath, [], {
        stdio: "pipe",
        env: decoderEnv,
      });
      logToFile(`Decoder process spawned, pid: ${goServer.pid}`);

      goServer.on("error", (err) => {
        logToFile("Decoder spawn error", err);
        console.error("Decoder spawn error:", err);
        if (cleanupInProgress) return;
        setDecoderStatus({
          state: "unavailable",
          reason: "spawn_error",
          message: "Raffi hit an error while starting its playback server.",
          detail: err?.message || String(err),
        });
      });

      goServer.on("exit", (code, signal) => {
        logToFile(`Decoder exited with code ${code} signal ${signal}`);
        console.log(`Decoder exited with code ${code} signal ${signal}`);
        if (cleanupInProgress) return;
        const exitParts = [];
        if (code !== null && code !== undefined) exitParts.push(`exit code ${code}`);
        if (signal) exitParts.push(`signal ${signal}`);
        setDecoderStatus({
          state: "unavailable",
          reason: "process_exited",
          message:
            decoderStatus.state === "ready"
              ? "Raffi's playback server stopped unexpectedly."
              : "Raffi's playback server exited before it finished starting.",
          detail: exitParts.length > 0 ? `The playback server exited with ${exitParts.join(" and ")}.` : "The playback server exited unexpectedly.",
        });
      });

      goServer.stdout.on("data", (d) => {
        const msg = d.toString();
        console.log("[go]", msg);
        logToFile("[go stdout]", msg);
      });

      goServer.stderr.on("data", (d) => {
        const msg = d.toString();
        const lines = msg
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);

        const kept = lines.filter((line) => {
          if (line.includes("h264 bitstream error, startcode missing")) return false;
          if (line.includes("error flushing piece storage")) return false;
          if (line.includes("torrent github.com/anacrolix/torrent torrent.go:")) return false;
          if (line.includes("FlushFileBuffers: The handle is invalid")) return false;
          if (line.includes("FlushFileBuffers: Incorrect function")) return false;
          return true;
        });

        if (kept.length === 0) return;
        const output = kept.join("\n");
        console.error("[go err]", output);
        logToFile("[go stderr]", output);
      });
    } catch (err) {
      setDecoderStatus({
        state: "unavailable",
        reason: "start_failed",
        message: "Raffi could not launch its playback server.",
        detail: err?.message || String(err),
      });
      throw err;
    }
  }

  function cleanupDecoder() {
    cleanupInProgress = true;
    if (!goServer) return;
    goServer.kill("SIGTERM");
    setTimeout(() => {
      if (goServer && !goServer.killed) {
        goServer.kill("SIGKILL");
      }
    }, 1000);
  }

  return {
    startDecoderServer,
    waitForDecoderReady,
    cleanupDecoder,
    getDecoderStatus,
    getDecoderAuthSecret,
    onDecoderStatusChange,
  };
}

module.exports = {
  createDecoderService,
};
