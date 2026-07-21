const path = require("path");
const fs = require("fs");
const fsp = fs.promises;

function createLogger(app) {
  const FLUSH_INTERVAL_MS = 150;
  const MAX_BUFFER_LINES = 64;

  let buffer = [];
  let flushTimer = null;
  let flushing = false;
  let exitFlushRegistered = false;

  const getFallbackLogPath = () => {
    const baseDir =
      process.env.APPDATA ||
      process.env.LOCALAPPDATA ||
      process.env.TEMP ||
      process.cwd();
    const logDir = path.join(baseDir, "Raffi");
    try {
      fs.mkdirSync(logDir, { recursive: true });
    } catch {
      // ignore
    }
    return path.join(logDir, "raffi-main.log");
  };

  const getLogPath = () => {
    try {
      if (app && app.isReady()) {
        const logDir = app.getPath("userData");
        fs.mkdirSync(logDir, { recursive: true });
        return path.join(logDir, "raffi-main.log");
      }
    } catch {
      // ignore
    }

    return getFallbackLogPath();
  };

  const formatLine = (message, error) => {
    const time = new Date().toISOString();
    const details = error ? `\n${error.stack || error.message || error}` : "";
    return `[${time}] ${message}${details}\n`;
  };

  const writeSync = (logPath, text) => {
    fs.appendFileSync(logPath, text);
  };

  const logFallback = (message, error) => {
    try {
      writeSync(getFallbackLogPath(), formatLine(message, error));
    } catch {
      // ignore
    }
  };

  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushBuffer();
    }, FLUSH_INTERVAL_MS);
    if (typeof flushTimer.unref === "function") {
      flushTimer.unref();
    }
  };

  const flushBuffer = async ({ sync = false } = {}) => {
    if (buffer.length === 0 || flushing) return;
    flushing = true;

    const lines = buffer;
    buffer = [];
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    const text = lines.join("");
    const logPath = getLogPath();

    try {
      if (sync) {
        writeSync(logPath, text);
      } else {
        await fsp.appendFile(logPath, text);
      }
    } catch (err) {
      try {
        writeSync(getFallbackLogPath(), text);
      } catch {
        // ignore
      }
      if (!sync) {
        logFallback("Failed to write main log", err);
      }
    } finally {
      flushing = false;
      if (buffer.length > 0) {
        scheduleFlush();
      }
    }
  };

  const enqueue = (message, error) => {
    buffer.push(formatLine(message, error));
    if (buffer.length >= MAX_BUFFER_LINES) {
      void flushBuffer();
      return;
    }
    scheduleFlush();
  };

  const logToFile = (message, error) => {
    try {
      enqueue(message, error);
    } catch (err) {
      logFallback("Failed to queue main log", err);
    }
  };

  if (!exitFlushRegistered) {
    exitFlushRegistered = true;
    process.once("exit", () => {
      void flushBuffer({ sync: true });
    });
    process.once("beforeExit", () => {
      void flushBuffer();
    });
  }

  return {
    getFallbackLogPath,
    getLogPath,
    logFallback,
    logToFile,
    flushLogs: () => flushBuffer({ sync: true }),
  };
}

module.exports = {
  createLogger,
};
