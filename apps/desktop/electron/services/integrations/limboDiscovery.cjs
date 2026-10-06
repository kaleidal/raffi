const path = require("path");
const os = require("os");

function candidateLimboApiPaths({
  platform = process.platform,
  env = process.env,
  home = os.homedir(),
} = {}) {
  const candidates = [];
  const platformPath = platform === "win32" ? path.win32 : path.posix;

  if (platform === "win32") {
    const appData = env.APPDATA || platformPath.join(home, "AppData", "Roaming");
    candidates.push(
      platformPath.join(appData, "kaleid", "Limbo", "data", "api.json"),
    );
  } else if (platform === "darwin") {
    candidates.push(
      platformPath.join(home, "Library", "Application Support", "al.kaleid.Limbo", "api.json"),
    );
  } else {
    const dataHomes = [
      env.XDG_DATA_HOME || platformPath.join(home, ".local", "share"),
      env.HOST_XDG_DATA_HOME,
    ].filter((value, index, values) => value && values.indexOf(value) === index);
    candidates.push(...dataHomes.map((dataHome) => platformPath.join(dataHome, "limbo", "api.json")));
  }

  return candidates;
}

async function readLimboApiDiscovery(fs) {
  for (const filePath of candidateLimboApiPaths()) {
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
  candidateLimboApiPaths,
  readLimboApiDiscovery,
};
