const path = require("path");
const fs = require("fs");
const fsp = fs.promises;

const FLUSH_INTERVAL_MS = 150;
const MAX_BUFFER_LINES = 64;

function createLogger(app) {
  const logPath = path.join(app.getPath("userData"), "raffi-main.log");
  fs.mkdirSync(path.dirname(logPath), { recursive: true });

  let buffer = [];
  let flushTimer = null;
  let flushing = false;

  const formatLine = (message, error) => {
    const time = new Date().toISOString();
    const details = error ? `\n${error.stack || error.message || error}` : "";
    return `[${time}] ${message}${details}\n`;
  };

  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushBuffer();
    }, FLUSH_INTERVAL_MS);
    flushTimer.unref();
  };

  const flushBuffer = async ({ sync = false } = {}) => {
    if (buffer.length === 0 || flushing) return;
    flushing = true;

    const text = buffer.join("");
    buffer = [];
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    try {
      if (sync) fs.appendFileSync(logPath, text);
      else await fsp.appendFile(logPath, text);
    } catch (err) {
      console.error("Failed to write main log", err);
    } finally {
      flushing = false;
      if (buffer.length > 0) scheduleFlush();
    }
  };

  const logToFile = (message, error) => {
    buffer.push(formatLine(message, error));
    if (buffer.length >= MAX_BUFFER_LINES) void flushBuffer();
    else scheduleFlush();
  };

  process.once("exit", () => void flushBuffer({ sync: true }));
  process.once("beforeExit", () => void flushBuffer());

  return { logToFile };
}

module.exports = {
  createLogger,
};
