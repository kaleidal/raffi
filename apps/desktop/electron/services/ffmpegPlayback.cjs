const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { PassThrough, Readable } = require("stream");

const SCHEME = "raffi-transcode";
const STDERR_LIMIT = 32 * 1024;
const CLAIM_TIMEOUT_MS = 15_000;
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

function buildArguments({ source, startTime, audioIndex, copyAudio }) {
  const audioArguments = copyAudio
    ? ["-c:a", "copy"]
    : ["-c:a", "aac", "-b:a", "256k"];
  const protocolWhitelist = /^https?:\/\//i.test(source)
    ? "http,https,tcp,tls,httpproxy"
    : "file,crypto,data";
  return [
    "-hide_banner", "-loglevel", "error", "-nostdin",
    "-ss", String(startTime), "-protocol_whitelist", protocolWhitelist, "-i", source,
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
    session.output.destroy();
    if (!session.child.killed) session.child.kill("SIGTERM");
    return true;
  }

  async function start(payload) {
    await fs.promises.access(ffmpegPath, fs.constants.X_OK);
    const source = validateSource(payload?.source);
    const startTime = validateStartTime(payload?.startTime);
    const audioIndex = validateAudioIndex(payload?.audioIndex);
    const copyAudio = payload?.copyAudio === true;
    while (sessions.size >= MAX_SESSIONS) {
      stop(sessions.keys().next().value);
    }
    const sessionId = crypto.randomUUID();
    const output = new PassThrough({ highWaterMark: 512 * 1024 });
    output.on("error", () => {});
    const child = spawn(ffmpegPath, buildArguments({ source, startTime, audioIndex, copyAudio }), {
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
    };
    sessions.set(sessionId, session);
    session.claimTimer = setTimeout(() => stop(sessionId), CLAIM_TIMEOUT_MS);
    child.stdout.pipe(output, { end: false });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      session.stderr = `${session.stderr}${chunk}`.slice(-STDERR_LIMIT);
    });
    child.once("exit", (code, signal) => {
      sessions.delete(sessionId);
      clearTimeout(session.claimTimer);
      if (session.stopped) return;
      if (code === 0) {
        output.end();
        return;
      }
      const detail = session.stderr.trim() || `FFmpeg exited with ${code ?? signal}`;
      output.destroy(new Error(detail));
      logToFile?.("FFmpeg playback failed", detail);
    });

    await new Promise((resolve, reject) => {
      const handleSpawn = () => { cleanup(); resolve(); };
      const handleError = (error) => {
        cleanup();
        sessions.delete(sessionId);
        clearTimeout(session.claimTimer);
        session.stopped = true;
        output.destroy(error);
        reject(error);
      };
      const cleanup = () => {
        child.off("spawn", handleSpawn);
        child.off("error", handleError);
      };
      child.once("spawn", handleSpawn);
      child.once("error", handleError);
    });

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
