const FOLLOWED_HOSTS = new Set(["torrentio.strem.fun", "api.torbox.app"]);
const MAX_HOPS = 4;

const followable = (url) => url.protocol === "https:" && FOLLOWED_HOSTS.has(url.hostname);

/** Where `url` redirects to, or null when it answers directly; nothing past the headers is downloaded. */
const redirectTarget = (net, url) =>
  new Promise((resolve, reject) => {
    const request = net.request({ url, redirect: "manual" });
    request.on("redirect", (_status, _method, location) => {
      resolve(location);
      request.abort();
    });
    request.on("response", () => {
      resolve(null);
      request.abort();
    });
    request.on("error", reject);
    request.end();
  });

/** Follows the redirects of hosts that refuse browser requests, so the player can read the file they point to. */
function registerStreamResolveHandler({ ipcMain, net }) {
  ipcMain.handle("STREAM_RESOLVE", async (_event, target) => {
    let current = new URL(target);
    for (let hop = 0; hop < MAX_HOPS && followable(current); hop++) {
      const location = await redirectTarget(net, current.href);
      if (!location) break;
      current = new URL(location, current);
    }
    return current.href;
  });
}

module.exports = { registerStreamResolveHandler };
