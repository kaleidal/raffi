const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { Readable } = require("stream");

const SCHEME = "raffi-media";

function registerPrivilegedSchemes(protocol, additionalSchemes = []) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
      },
    },
    ...additionalSchemes,
  ]);
}

function guessContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".mp4":
    case ".m4v":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mkv":
      return "video/x-matroska";
    case ".mov":
      return "video/quicktime";
    case ".avi":
      return "video/x-msvideo";
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    case ".flac":
      return "audio/flac";
    case ".aac":
      return "audio/aac";
    default:
      return "application/octet-stream";
  }
}

function parseRange(rangeHeader, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(rangeHeader || "").trim());
  if (!match) return null;
  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end < start || start >= size) return null;
  end = Math.min(end, size - 1);
  return { start, end };
}

function resolveLocalPathFromRequest(requestUrl) {
  let parsed;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${SCHEME}:`) return null;

  const fromQuery = parsed.searchParams.get("path");
  if (fromQuery && typeof fromQuery === "string" && fromQuery.trim()) {
    return path.resolve(fromQuery);
  }

  // raffi-media://local/<urlencoded-absolute-path>
  if (parsed.hostname === "local") {
    const encoded = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    if (!encoded) return null;
    return path.resolve(encoded);
  }

  return null;
}

function createLocalMediaProtocolHandler({ protocol, net, logToFile }) {
  protocol.handle(SCHEME, async (request) => {
    try {
      const filePath = resolveLocalPathFromRequest(request.url);
      if (!filePath) {
        return new Response("Invalid local media URL", { status: 400 });
      }
      if (filePath.includes("\0") || filePath.includes("://")) {
        return new Response("Forbidden", { status: 403 });
      }

      let stats;
      try {
        stats = await fs.promises.stat(filePath);
      } catch {
        return new Response("Not found", { status: 404 });
      }
      if (!stats.isFile()) {
        return new Response("Not found", { status: 404 });
      }

      const contentType = guessContentType(filePath);
      const rangeHeader = request.headers.get("range");
      const baseHeaders = {
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      };

      if (!rangeHeader) {
        // Prefer net.fetch(file) when possible — better Chromium media interop.
        try {
          const fileUrl = pathToFileURL(filePath).href;
          const upstream = await net.fetch(fileUrl, {
            method: request.method,
            headers: request.headers,
            signal: request.signal,
          });
          const headers = new Headers(upstream.headers);
          headers.set("Content-Type", contentType);
          headers.set("Accept-Ranges", "bytes");
          headers.set("Access-Control-Allow-Origin", "*");
          headers.set("Cross-Origin-Resource-Policy", "cross-origin");
          return new Response(upstream.body, {
            status: upstream.status,
            statusText: upstream.statusText,
            headers,
          });
        } catch {
          const stream = fs.createReadStream(filePath);
          return new Response(Readable.toWeb(stream), {
            status: 200,
            headers: {
              ...baseHeaders,
              "Access-Control-Allow-Origin": "*",
              "Cross-Origin-Resource-Policy": "cross-origin",
              "Content-Length": String(stats.size),
            },
          });
        }
      }

      const range = parseRange(rangeHeader, stats.size);
      if (!range) {
        return new Response(null, {
          status: 416,
          headers: {
            ...baseHeaders,
            "Access-Control-Allow-Origin": "*",
            "Cross-Origin-Resource-Policy": "cross-origin",
            "Content-Range": `bytes */${stats.size}`,
          },
        });
      }

      // Forward Range to Chromium's file fetcher when available.
      try {
        const fileUrl = pathToFileURL(filePath).href;
        const upstream = await net.fetch(fileUrl, {
          headers: { Range: rangeHeader },
          signal: request.signal,
        });
        if (upstream.status === 206 || upstream.status === 200) {
          const headers = new Headers(upstream.headers);
          headers.set("Content-Type", contentType);
          headers.set("Accept-Ranges", "bytes");
          headers.set("Access-Control-Allow-Origin", "*");
          headers.set("Cross-Origin-Resource-Policy", "cross-origin");
          return new Response(upstream.body, {
            status: upstream.status,
            headers,
          });
        }
      } catch {
        // fall through to manual stream
      }

      const contentLength = range.end - range.start + 1;
      const stream = fs.createReadStream(filePath, {
        start: range.start,
        end: range.end,
      });
      return new Response(Readable.toWeb(stream), {
        status: 206,
        headers: {
          ...baseHeaders,
          "Access-Control-Allow-Origin": "*",
          "Cross-Origin-Resource-Policy": "cross-origin",
          "Content-Length": String(contentLength),
          "Content-Range": `bytes ${range.start}-${range.end}/${stats.size}`,
        },
      });
    } catch (error) {
      if (request.signal.aborted || error?.name === "AbortError") {
        throw error;
      }
      logToFile?.("raffi-media protocol handler failed", error);
      return new Response("Internal error", { status: 500 });
    }
  });
}

module.exports = {
  registerPrivilegedSchemes,
  createLocalMediaProtocolHandler,
};
