const path = require("path");
const fs = require("fs");

function createLogger(app) {
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

  const logFallback = (message, error) => {
    try {
      const logPath = getFallbackLogPath();
      const time = new Date().toISOString();
      const details = error ? `\n${error.stack || error.message || error}` : "";
      fs.appendFileSync(logPath, `[${time}] ${message}${details}\n`);
    } catch {
      // ignore
    }
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

  const logToFile = (message, error) => {
    try {
      const logPath = getLogPath();
      const time = new Date().toISOString();
      const details = error ? `\n${error.stack || error.message || error}` : "";
      fs.appendFileSync(logPath, `[${time}] ${message}${details}\n`);
    } catch (err) {
      logFallback("Failed to write main log", err);
    }
  };

  return {
    getFallbackLogPath,
    getLogPath,
    logFallback,
    logToFile,
  };
}

module.exports = {
  createLogger,
};
