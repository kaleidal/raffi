const path = require("path");
const os = require("os");

function candidateLimboApiPaths(fs) {
  const home = os.homedir();
  const candidates = [];

  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    candidates.push(
      path.join(appData, "limbo", "api.json"),
      path.join(appData, "Limbo", "api.json"),
      path.join(localAppData, "limbo", "api.json"),
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      path.join(home, "Library", "Application Support", "limbo", "api.json"),
      path.join(home, "Library", "Application Support", "Limbo", "api.json"),
    );
  } else {
    const xdg = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
    candidates.push(
      path.join(xdg, "limbo", "api.json"),
      path.join(xdg, "Limbo", "api.json"),
    );
  }

  return candidates;
}

async function readLimboApiDiscovery(fs) {
  for (const filePath of candidateLimboApiPaths(fs)) {
    try {
      const raw = await fs.promises.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") continue;
      return {
        version: parsed.version,
        port: parsed.port,
        token: parsed.token,
        host: parsed.host,
        baseUrl: parsed.baseUrl,
        updatedAt: parsed.updatedAt,
        path: filePath,
      };
    } catch {
      // try next
    }
  }
  return null;
}

module.exports = {
  readLimboApiDiscovery,
  candidateLimboApiPaths,
};
