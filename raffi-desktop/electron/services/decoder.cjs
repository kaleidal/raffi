const http = require("http");

function createDecoderService({ isDev, path, fs, spawn, logToFile, baseDir }) {
  let goServer = null;

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

  async function waitForDecoderReady(maxRetries = 30, retryDelayMs = 500) {
    const serverUrl = "http://127.0.0.1:6969";

    for (let i = 0; i < maxRetries; i++) {
      try {
        await new Promise((resolve, reject) => {
          const req = http.get(`${serverUrl}/`, (res) => {
            if (res.statusCode) resolve();
            else reject(new Error(`Unexpected status code: ${res.statusCode}`));
          });
          req.on("error", reject);
          req.setTimeout(1000, () => {
            req.destroy();
            reject(new Error("Timeout"));
          });
        });

        logToFile(`Decoder server ready after ${i + 1} attempts`);
        return true;
      } catch (err) {
        if (i === maxRetries - 1) {
          logToFile(`Decoder server not ready after ${maxRetries} attempts`, err);
          return false;
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }

    return false;
  }

  async function startDecoderServer() {
    const binPath = getDecoderPath();
    console.log("Binary path:", binPath);
    logToFile("Decoder binary path", binPath);

    if (!fs.existsSync(binPath)) {
      const err = `Decoder binary not found at ${binPath}`;
      logToFile(err);
      console.error(err);
      throw new Error(err);
    }

    await ensureDecoderExecutable(binPath);

    logToFile("Spawning decoder process");
    goServer = spawn(binPath, [], { stdio: "pipe" });
    logToFile(`Decoder process spawned, pid: ${goServer.pid}`);

    goServer.on("error", (err) => {
      logToFile("Decoder spawn error", err);
      console.error("Decoder spawn error:", err);
    });

    goServer.on("exit", (code, signal) => {
      logToFile(`Decoder exited with code ${code} signal ${signal}`);
      console.log(`Decoder exited with code ${code} signal ${signal}`);
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
  }

  function cleanupDecoder() {
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
  };
}

module.exports = {
  createDecoderService,
};
