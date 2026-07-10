const dns = require("dns").promises;
const http = require("http");
const https = require("https");
const net = require("net");
const { Readable } = require("stream");

const IPTV_MAX_REDIRECTS = 5;
const IPTV_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const IPTV_BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "loopback",
  "broadcasthost",
  "metadata",
  "metadata.google.internal",
  "instance-data",
  "instance-data.ec2.internal",
]);
const IPTV_BLOCKED_HOSTNAME_SUFFIXES = [
  ".localhost",
  ".metadata.google.internal",
];
const iptvBlockedAddressList = new net.BlockList();
iptvBlockedAddressList.addSubnet("0.0.0.0", 8, "ipv4");
iptvBlockedAddressList.addSubnet("127.0.0.0", 8, "ipv4");
iptvBlockedAddressList.addSubnet("169.254.0.0", 16, "ipv4");
iptvBlockedAddressList.addSubnet("224.0.0.0", 4, "ipv4");
iptvBlockedAddressList.addSubnet("240.0.0.0", 4, "ipv4");
iptvBlockedAddressList.addSubnet("::", 96, "ipv6");
iptvBlockedAddressList.addAddress("::", "ipv6");
iptvBlockedAddressList.addAddress("::1", "ipv6");
iptvBlockedAddressList.addSubnet("fe80::", 10, "ipv6");
iptvBlockedAddressList.addSubnet("ff00::", 8, "ipv6");

function createAbortError() {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

function normalizeIptvHostname(hostname) {
  let normalized = String(hostname || "").trim().toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }
  return normalized.replace(/\.+$/, "");
}

function isBlockedIptvHostname(hostname) {
  const normalized = normalizeIptvHostname(hostname);
  return (
    IPTV_BLOCKED_HOSTNAMES.has(normalized) ||
    IPTV_BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  );
}

function isBlockedIptvAddress(address) {
  const normalized = normalizeIptvHostname(address);
  const version = net.isIP(normalized);
  if (!version) return true;
  return iptvBlockedAddressList.check(normalized, version === 4 ? "ipv4" : "ipv6");
}

function parseIptvFetchUrl(target) {
  let parsed;

  try {
    parsed = new URL(target);
  } catch {
    throw new Error("Enter a valid IPTV URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http/https IPTV URLs are supported");
  }

  if (!normalizeIptvHostname(parsed.hostname)) {
    throw new Error("Enter a valid IPTV URL");
  }

  return parsed;
}

async function assertSafeIptvFetchUrl(parsed) {
  const hostname = normalizeIptvHostname(parsed.hostname);

  if (isBlockedIptvHostname(hostname)) {
    throw new Error("IPTV URL host is not allowed");
  }

  if (net.isIP(hostname)) {
    if (isBlockedIptvAddress(hostname)) {
      throw new Error("IPTV URL host is not allowed");
    }
    return [{ address: hostname, family: net.isIP(hostname) }];
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, {
      all: true,
      verbatim: true,
    });
  } catch {
    throw new Error("IPTV URL host could not be resolved");
  }

  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new Error("IPTV URL host could not be resolved");
  }

  for (const entry of addresses) {
    if (isBlockedIptvAddress(entry.address)) {
      throw new Error("IPTV URL host is not allowed");
    }
  }

  return addresses.map((entry) => ({
    address: entry.address,
    family: entry.family,
  }));
}

function getIptvFetchPort(parsed) {
  if (parsed.port) return parsed.port;
  return parsed.protocol === "https:" ? "443" : "80";
}

function getIptvFetchAuth(parsed) {
  if (!parsed.username && !parsed.password) return undefined;
  return `${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`;
}

function headersFromNodeHeaders(nodeHeaders) {
  const headers = new Headers();

  for (const [name, value] of Object.entries(nodeHeaders)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
      continue;
    }

    if (value !== undefined) {
      headers.set(name, String(value));
    }
  }

  return headers;
}

function fetchIptvUrlAtResolvedAddress(parsed, resolvedAddress, signal) {
  const client = parsed.protocol === "https:" ? https : http;
  const hostname = normalizeIptvHostname(parsed.hostname);

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    let settled = false;
    let request;
    const cleanupRequestAbort = () => {
      signal?.removeEventListener?.("abort", onRequestAbort);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanupRequestAbort();
      reject(error);
    };
    const onRequestAbort = () => {
      request?.destroy(createAbortError());
    };

    request = client.request(
      {
        protocol: parsed.protocol,
        hostname: resolvedAddress.address,
        port: getIptvFetchPort(parsed),
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        auth: getIptvFetchAuth(parsed),
        headers: {
          Host: parsed.host,
        },
        servername: parsed.protocol === "https:" && !net.isIP(hostname) ? hostname : undefined,
      },
      (incoming) => {
        if (settled) {
          incoming.destroy();
          return;
        }

        settled = true;
        cleanupRequestAbort();

        const onBodyAbort = () => {
          incoming.destroy(createAbortError());
        };
        if (signal?.aborted) {
          incoming.destroy(createAbortError());
        } else if (signal) {
          signal.addEventListener("abort", onBodyAbort, { once: true });
          incoming.once("close", () => {
            signal.removeEventListener("abort", onBodyAbort);
          });
        }

        const status = incoming.statusCode || 500;
        const body = [204, 205, 304].includes(status) ? null : Readable.toWeb(incoming);
        resolve(
          new Response(body, {
            status,
            statusText: incoming.statusMessage,
            headers: headersFromNodeHeaders(incoming.headers),
          }),
        );
      },
    );

    request.once("error", fail);
    signal?.addEventListener?.("abort", onRequestAbort, { once: true });
    request.end();
  });
}

async function getSafeIptvFetchResponse(initialUrl, signal) {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= IPTV_MAX_REDIRECTS; redirectCount += 1) {
    const resolvedAddresses = await assertSafeIptvFetchUrl(currentUrl);
    let response;
    let lastFetchError;

    for (const resolvedAddress of resolvedAddresses) {
      try {
        response = await fetchIptvUrlAtResolvedAddress(currentUrl, resolvedAddress, signal);
        break;
      } catch (error) {
        lastFetchError = error;
        if (error?.name === "AbortError") {
          throw error;
        }
      }
    }

    if (!response) {
      throw lastFetchError || new Error("IPTV URL host could not be reached");
    }

    if (!IPTV_REDIRECT_STATUSES.has(response.status)) {
      return { response, url: currentUrl };
    }

    if (redirectCount >= IPTV_MAX_REDIRECTS) {
      await response.body?.cancel?.().catch(() => {});
      throw new Error("IPTV redirect limit exceeded");
    }

    const location = response.headers.get("location");
    await response.body?.cancel?.().catch(() => {});

    if (!location) {
      throw new Error("IPTV redirect did not include a target");
    }

    currentUrl = parseIptvFetchUrl(new URL(location, currentUrl).toString());
  }

  throw new Error("IPTV redirect limit exceeded");
}

function registerIptvFetchHandler({ ipcMain, logToFile }) {
  ipcMain.handle("IPTV_FETCH_TEXT", async (_event, payload) => {
    const target = typeof payload?.url === "string" ? payload.url.trim() : "";
    const initialUrl = parseIptvFetchUrl(target);

    const timeoutMs = Math.min(
      Math.max(Number(payload?.options?.timeoutMs) || 30000, 1000),
      120000,
    );
    const maxBytes = Math.min(
      Math.max(Number(payload?.options?.maxBytes) || 64 * 1024 * 1024, 1024),
      128 * 1024 * 1024,
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const { response, url: responseUrl } = await getSafeIptvFetchResponse(
        initialUrl,
        controller.signal,
      );
      const responseHost = normalizeIptvHostname(responseUrl.hostname);

      if (!response.ok) {
        await response.body?.cancel?.().catch(() => {});
        logToFile("IPTV fetch failed", {
          host: responseHost,
          status: response.status,
        });
        throw new Error(`Fetch failed with HTTP ${response.status}`);
      }

      const reader = response.body?.getReader?.();
      if (!reader) {
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > maxBytes) {
          await response.body?.cancel?.().catch(() => {});
          throw new Error("IPTV response exceeded maximum size");
        }
        logToFile("IPTV fetch completed", {
          host: responseHost,
          status: response.status,
          bytes: arrayBuffer.byteLength,
        });
        return {
          ok: true,
          status: response.status,
          text: Buffer.from(arrayBuffer).toString("utf8"),
        };
      }

      const chunks = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new Error("IPTV response exceeded maximum size");
        }
        chunks.push(Buffer.from(value));
      }

      logToFile("IPTV fetch completed", {
        host: responseHost,
        status: response.status,
        bytes: totalBytes,
      });

      return {
        ok: true,
        status: response.status,
        text: Buffer.concat(chunks, totalBytes).toString("utf8"),
      };
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("IPTV fetch timed out");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  });
}

module.exports = {
  registerIptvFetchHandler,
};
