const HLS_TAG = /#EXT-X-/;

/** Channel lists are M3U too, but only HLS playlists carry EXT-X tags. */
function isHlsPlaylist(text) {
  return text.trimStart().startsWith("#EXTM3U") && HLS_TAG.test(text);
}

/**
 * Makes every link in an HLS playlist absolute against where it was actually served from,
 * then routes it back through the proxy, so segments survive redirects to other servers.
 */
function rewriteHlsPlaylist(text, baseUrl, proxy) {
  const resolve = (uri) => {
    const absolute = new URL(uri, baseUrl);
    return absolute.protocol === "http:" || absolute.protocol === "https:" ? proxy(absolute.href) : uri;
  };
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) return line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${resolve(uri)}"`);
      return resolve(trimmed);
    })
    .join("\n");
}

module.exports = { isHlsPlaylist, rewriteHlsPlaylist };
