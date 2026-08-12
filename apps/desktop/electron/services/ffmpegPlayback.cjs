const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { PassThrough, Readable } = require("stream");

const SCHEME = "raffi-transcode";
const STDERR_LIMIT = 32 * 1024;
const CLAIM_TIMEOUT_MS = 15_000;
const STARTUP_TIMEOUT_MS = 30_000;
const STOP_TIMEOUT_MS = 2_000;
const MAX_SESSIONS = 2;

const ffmpegPrivilegedScheme = {
  scheme: SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    stream: true,
    corsEnabled: true,
  },
};

function resolveFfmpegPath({ app, baseDir, resourcesPath }) {
  const executable = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  return app.isPackaged
    ? path.join(resourcesPath, "ffmpeg", executable)
    : path.join(baseDir, "..", "vendor", "ffmpeg", executable);
}

function validateSource(source) {
  if (typeof source !== "string" || !source.trim() || source.includes("\0")) {
    throw new Error("Invalid FFmpeg media source");
  }
  const value = source.trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (!path.isAbsolute(value)) {
    throw new Error("FFmpeg only accepts HTTP(S) URLs or absolute local paths");
  }
  const resolved = path.resolve(value);
  const stats = fs.statSync(resolved);
  if (!stats.isFile()) throw new Error("FFmpeg media source is not a file");
  return resolved;
}

function validateStartTime(value) {
  const time = Number(value ?? 0);
  if (!Number.isFinite(time) || time < 0) throw new Error("Invalid FFmpeg start time");
  return time;
}

function validateAudioIndex(value) {
  const index = Number(value ?? 0);
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new Error("Invalid FFmpeg audio track index");
  }
  return index;
}

function validateAudioChannels(value) {
  if (value == null) return null;
  const channels = Number(value);
  if (!Number.isSafeInteger(channels) || channels < 1 || channels > 32) {
    throw new Error("Invalid FFmpeg audio channel count");
  }
  return channels;
}

function resolveCaFile(source) {
  if (process.platform !== "linux" || !/^https:\/\//i.test(source)) return null;
  const candidates = [
    process.env.SSL_CERT_FILE,
    process.env.NIX_SSL_CERT_FILE,
    "/etc/ssl/cert.pem",
    "/etc/ssl/certs/ca-certificates.crt",
    "/etc/pki/tls/certs/ca-bundle.crt",
    "/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem",
    "/etc/ssl/ca-bundle.pem",
    "/var/lib/ca-certificates/ca-bundle.pem",
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !path.isAbsolute(candidate)) continue;
    try {
      fs.accessSync(candidate, fs.constants.R_OK);
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  throw new Error("FFmpeg could not find the Linux system CA certificate bundle");
}

function buildArguments({ source, startTime, audioIndex, audioChannels, copyAudio, caFile }) {
  const surroundArguments = audioChannels === 6
    ? ["-af", "aformat=channel_layouts=5.1", "-mapping_family", "1"]
    : [];
  const audioArguments = copyAudio
    ? ["-c:a", "copy"]
    : ["-c:a", "libopus", "-b:a", "320k", ...surroundArguments];
  const protocolWhitelist = /^https?:\/\//i.test(source)
    ? "http,https,tcp,tls,httpproxy"
    : "file,crypto,data";
  return [
    "-hide_banner", "-loglevel", "error", "-nostdin",
    "-ss", String(startTime), "-noaccurate_seek", "-protocol_whitelist", protocolWhitelist,
    ...(caFile ? ["-ca_file", caFile] : []), "-i", source,
    "-map", "0:v:0", "-map", `0:a:${audioIndex}`,
    "-c:v", "copy", ...audioArguments,
    "-movflags", "frag_keyframe+empty_moov+default_base_moof",
    "-frag_duration", "500000", "-avoid_negative_ts", "make_zero",
    "-max_muxing_queue_size", "4096", "-f", "mp4", "pipe:1",
  ];
}

function createFfmpegPlaybackService({ app, protocol, ipcMain, spawn, baseDir, resourcesPath, logToFile }) {
  const sessions = new Map();
  const ffmpegPath = resolveFfmpegPath({ app, baseDir, resourcesPath });

  function stop(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return false;
    sessions.delete(sessionId);
    session.stopped = true;
    clearTimeout(session.claimTimer);
    clearTimeout(session.startupTimer);
    session.finishStartup?.(new Error("FFmpeg playback stopped"));
    session.output.destroy();
    if (session.child.exitCode === null) {
      session.child.kill("SIGTERM");
      session.killTimer = setTimeout(() => {
        if (session.child.exitCode === null) session.child.kill("SIGKILL");
      }, STOP_TIMEOUT_MS);
      session.killTimer.unref?.();
    }
    return true;
  }

  async function start(payload) {
    await fs.promises.access(ffmpegPath, fs.constants.X_OK);
    const source = validateSource(payload?.source);
    const startTime = validateStartTime(payload?.startTime);
    const audioIndex = validateAudioIndex(payload?.audioIndex);
    const audioChannels = validateAudioChannels(payload?.audioChannels);
    const copyAudio = payload?.copyAudio === true;
    const caFile = resolveCaFile(source);
    while (sessions.size >= MAX_SESSIONS) {
      stop(sessions.keys().next().value);
    }
    const sessionId = crypto.randomUUID();
    const output = new PassThrough({ highWaterMark: 512 * 1024 });
    output.on("error", () => {});
    const child = spawn(ffmpegPath, buildArguments({
      source,
      startTime,
      audioIndex,
      audioChannels,
      copyAudio,
      caFile,
    }), {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const session = {
      child,
      output,
      stderr: "",
      claimed: false,
      stopped: false,
      claimTimer: null,
      startupTimer: null,
      killTimer: null,
    };
    sessions.set(sessionId, session);
    child.stdout.pipe(output, { end: false });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      session.stderr = `${session.stderr}${chunk}`.slice(-STDERR_LIMIT);
    });
    const startup = new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(session.startupTimer);
        child.stdout.off("data", handleOutput);
        if (error) reject(error);
        else resolve();
      };
      const handleOutput = () => finish();
      child.stdout.once("data", handleOutput);
      session.startupTimer = setTimeout(() => {
        const error = new Error("FFmpeg did not produce a playable stream within 30 seconds");
        finish(error);
        stop(sessionId);
      }, STARTUP_TIMEOUT_MS);
      session.finishStartup = finish;
    });
    child.once("error", (error) => {
      sessions.delete(sessionId);
      session.stopped = true;
      clearTimeout(session.killTimer);
      output.destroy(error);
      session.finishStartup(error);
    });
    child.once("exit", (code, signal) => {
      sessions.delete(sessionId);
      clearTimeout(session.claimTimer);
      clearTimeout(session.startupTimer);
      clearTimeout(session.killTimer);
      if (session.stopped) return;
      if (code === 0) {
        session.finishStartup(new Error("FFmpeg produced no playable media"));
        output.end();
        return;
      }
      const rawDetail = session.stderr.trim() || `FFmpeg exited with ${code ?? signal}`;
      const detail = rawDetail.split(source).join("<media source>");
      session.finishStartup(new Error(detail));
      output.destroy(new Error(detail));
      logToFile?.("FFmpeg playback failed", detail);
    });

    await startup;
    session.claimTimer = setTimeout(() => stop(sessionId), CLAIM_TIMEOUT_MS);

    return { sessionId, streamUrl: `${SCHEME}://stream/${sessionId}`, startTime };
  }

  ipcMain.handle("FFMPEG_PLAYBACK_START", (_event, payload) => start(payload));
  ipcMain.handle("FFMPEG_PLAYBACK_STOP", (_event, sessionId) => stop(sessionId));

  protocol.handle(SCHEME, (request) => {
    const parsed = new URL(request.url);
    const sessionId = parsed.hostname === "stream" ? parsed.pathname.slice(1) : "";
    const session = sessions.get(sessionId);
    if (!session || session.claimed) return new Response("Not found", { status: 404 });
    session.claimed = true;
    clearTimeout(session.claimTimer);
    request.signal.addEventListener("abort", () => stop(sessionId), { once: true });
    return new Response(Readable.toWeb(session.output), {
      headers: {
        "Content-Type": "video/mp4",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "Cross-Origin-Resource-Policy": "cross-origin",
      },
    });
  });

  return {
    cleanup() {
      for (const sessionId of [...sessions.keys()]) stop(sessionId);
    },
  };
}

module.exports = { ffmpegPrivilegedScheme, createFfmpegPlaybackService };
