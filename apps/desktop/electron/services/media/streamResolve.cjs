const FOLLOWED_HOSTS = new Set(["torrentio.strem.fun", "api.torbox.app"]);
const MAX_HOPS = 4;

const followable = (url) => url.protocol === "https:" && FOLLOWED_HOSTS.has(url.hostname);

/** Follows the redirects of hosts that refuse browser requests, so the player can read the file they point to. */
function registerStreamResolveHandler({ ipcMain, net }) {
  ipcMain.handle("STREAM_RESOLVE", async (_event, target) => {
    let current = new URL(target);
    if (!followable(current)) return current.href;
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const response = await net.fetch(current.href, { redirect: "manual" });
      void response.body?.cancel();
      const location = response.headers.get("location");
      if (!location) return current.href;
      const next = new URL(location, current);
      if (!followable(next)) return next.href;
      current = next;
    }
    return current.href;
  });
}

module.exports = { registerStreamResolveHandler };
