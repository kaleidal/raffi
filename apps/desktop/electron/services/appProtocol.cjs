const path = require("path");
const { pathToFileURL } = require("url");

const APP_SCHEME = "raffi-app";
const APP_ORIGIN = `${APP_SCHEME}://app`;
const appPrivilegedScheme = {
  scheme: APP_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
  },
};

function resolveAppAssetPath(distPath, requestUrl) {
  let url;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${APP_SCHEME}:` || url.hostname !== "app") {
    return null;
  }

  let relativePath;
  try {
    relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  } catch {
    return null;
  }

  const root = path.resolve(distPath);
  const filePath = path.resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    return null;
  }
  return filePath;
}

function createAppProtocolHandler({ protocol, net, distPath, logToFile }) {
  protocol.handle(APP_SCHEME, async (request) => {
    const filePath = resolveAppAssetPath(distPath, request.url);
    if (!filePath) {
      return new Response("Not found", { status: 404 });
    }

    try {
      return await net.fetch(pathToFileURL(filePath).href, {
        method: request.method,
        signal: request.signal,
      });
    } catch (error) {
      if (request.signal.aborted || error?.name === "AbortError") {
        throw error;
      }
      logToFile?.("Failed serving packaged app asset", error);
      return new Response("Not found", { status: 404 });
    }
  });
}

module.exports = {
  APP_ORIGIN,
  appPrivilegedScheme,
  createAppProtocolHandler,
  resolveAppAssetPath,
};
