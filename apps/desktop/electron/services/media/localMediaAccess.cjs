const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SCHEME = "raffi-media";

function isPathInside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function createLocalMediaAccess({ maxCapabilities = 512, logToFile } = {}) {
  const capabilities = new Map();
  const tokensByPath = new Map();
  const libraryRoots = new Set();
  let rootsFilePath = null;

  async function canonicalFile(candidate) {
    if (typeof candidate !== "string" || !path.isAbsolute(candidate)) throw new Error("Expected an absolute local media path");
    const canonical = await fs.promises.realpath(candidate);
    if (!(await fs.promises.stat(canonical)).isFile()) throw new Error("Local media path is not a file");
    return canonical;
  }

  async function canonicalDirectory(candidate) {
    if (typeof candidate !== "string" || !path.isAbsolute(candidate)) throw new Error("Expected an absolute library path");
    const canonical = await fs.promises.realpath(candidate);
    if (!(await fs.promises.stat(canonical)).isDirectory()) throw new Error("Library path is not a directory");
    return canonical;
  }

  function issueCapability(canonical) {
    const existing = tokensByPath.get(canonical);
    if (existing && capabilities.has(existing)) {
      capabilities.delete(existing);
      capabilities.set(existing, canonical);
      return `${SCHEME}://local/${existing}`;
    }
    const token = crypto.randomUUID();
    capabilities.set(token, canonical);
    tokensByPath.set(canonical, token);
    while (capabilities.size > maxCapabilities) {
      const oldest = capabilities.entries().next().value;
      if (!oldest) break;
      capabilities.delete(oldest[0]);
      tokensByPath.delete(oldest[1]);
    }
    return `${SCHEME}://local/${token}`;
  }

  async function authorizeTrustedFile(candidate) {
    return issueCapability(await canonicalFile(candidate));
  }

  async function authorizeLibraryFile(candidate) {
    const canonical = await canonicalFile(candidate);
    if (![...libraryRoots].some((root) => isPathInside(canonical, root))) throw new Error("File is outside the approved local library");
    return issueCapability(canonical);
  }

  function resolveRequestUrl(requestUrl) {
    let parsed;
    try {
      parsed = new URL(requestUrl);
    } catch {
      return null;
    }
    if (parsed.protocol !== `${SCHEME}:` || parsed.hostname !== "local" || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length !== 1) return null;
    const token = segments[0];
    const filePath = capabilities.get(token);
    if (!filePath) return null;
    capabilities.delete(token);
    capabilities.set(token, filePath);
    return filePath;
  }

  async function persistRoots() {
    if (!rootsFilePath) return;
    await fs.promises.mkdir(path.dirname(rootsFilePath), { recursive: true });
    const temporaryPath = `${rootsFilePath}.tmp`;
    await fs.promises.writeFile(temporaryPath, JSON.stringify([...libraryRoots]), "utf8");
    await fs.promises.rename(temporaryPath, rootsFilePath);
  }

  async function loadRoots(filePath) {
    rootsFilePath = filePath;
    libraryRoots.clear();
    try {
      const stored = JSON.parse(await fs.promises.readFile(filePath, "utf8"));
      if (!Array.isArray(stored)) return;
      for (const candidate of stored.slice(0, 20)) {
        try {
          libraryRoots.add(await canonicalDirectory(candidate));
        } catch {}
      }
    } catch (error) {
      if (error?.code !== "ENOENT") logToFile?.("Failed to load local library roots", error);
    }
  }

  async function approveLibraryRoot(candidate) {
    const canonical = await canonicalDirectory(candidate);
    libraryRoots.add(canonical);
    await persistRoots();
    return canonical;
  }

  async function removeLibraryRoot(candidate) {
    const resolved = path.resolve(candidate);
    const root = [...libraryRoots].find((entry) => entry === resolved);
    if (!root) return false;
    libraryRoots.delete(root);
    for (const [token, filePath] of capabilities) {
      if (!isPathInside(filePath, root)) continue;
      capabilities.delete(token);
      tokensByPath.delete(filePath);
    }
    await persistRoots();
    return true;
  }

  return {
    approveLibraryRoot,
    authorizeLibraryFile,
    authorizeTrustedFile,
    getLibraryRoots: () => [...libraryRoots],
    loadRoots,
    removeLibraryRoot,
    resolveRequestUrl,
  };
}

module.exports = { createLocalMediaAccess };
