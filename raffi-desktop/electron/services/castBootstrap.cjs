const os = require("os");

function parsePortFromAddr(addr, fallbackPort = 6969) {
  if (!addr || typeof addr !== "string") return fallbackPort;
  const trimmed = addr.trim();
  if (!trimmed) return fallbackPort;

  const parts = trimmed.split(":");
  const maybePort = Number(parts[parts.length - 1]);
  if (!Number.isFinite(maybePort) || maybePort <= 0 || maybePort > 65535) {
    return fallbackPort;
  }
  return maybePort;
}

function getPrimaryIPv4() {
  const interfaces = os.networkInterfaces();
  const preferred = [];
  const others = [];

  for (const entries of Object.values(interfaces)) {
    if (!Array.isArray(entries)) continue;
    for (const net of entries) {
      if (!net || net.family !== "IPv4" || net.internal) continue;
      const address = String(net.address || "").trim();
      if (!address) continue;

      if (address.startsWith("192.168.") || address.startsWith("10.") || /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)) {
        preferred.push(address);
      } else {
        others.push(address);
      }
    }
  }

  return preferred[0] || others[0] || null;
}

function buildCastUrls({ localIp, port, sessionId, token }) {
  const encodedToken = encodeURIComponent(token);
  const host = `${localIp}:${port}`;
  return {
    streamUrl: `http://${host}/sessions/${sessionId}/stream/child.m3u8?cast_token=${encodedToken}`,
    sessionUrl: `http://${host}/sessions/${sessionId}?cast_token=${encodedToken}`,
  };
}

function createCastBootstrapService({ logToFile, serverAddr }) {
  const port = parsePortFromAddr(serverAddr, 6969);
  const loopbackBaseUrl = `http://127.0.0.1:${port}`;

  async function createBootstrap({ sessionId, ttlSeconds = 900 }) {
    if (!sessionId || typeof sessionId !== "string") {
      throw new Error("sessionId is required");
    }

    const localIp = getPrimaryIPv4();
    if (!localIp) {
      throw new Error("No LAN IPv4 address found for casting");
    }

    const response = await fetch(`${loopbackBaseUrl}/cast/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, ttlSeconds }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`cast token request failed: ${response.status} ${details}`);
    }

    const payload = await response.json();
    const token = typeof payload?.token === "string" ? payload.token : "";
    const expiresAt = typeof payload?.expiresAt === "string" ? payload.expiresAt : "";
    if (!token) {
      throw new Error("cast token missing in response");
    }

    const urls = buildCastUrls({ localIp, port, sessionId, token });
    const result = {
      sessionId,
      localIp,
      port,
      token,
      expiresAt,
      ...urls,
    };

    logToFile("Created cast bootstrap", {
      sessionId,
      localIp,
      port,
      expiresAt,
    });

    return result;
  }

  return {
    createBootstrap,
  };
}

module.exports = {
  createCastBootstrapService,
};
