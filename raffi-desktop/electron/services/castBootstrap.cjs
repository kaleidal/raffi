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

function isPrivateIPv4(address) {
  return (
    address.startsWith("10.") ||
    address.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)
  );
}

function isVirtualInterfaceName(name) {
  const normalized = String(name || "").toLowerCase();
  return (
    normalized.includes("vethernet") ||
    normalized.includes("hyper-v") ||
    normalized.includes("wsl") ||
    normalized.includes("docker") ||
    normalized.includes("virtualbox") ||
    normalized.includes("vmware") ||
    normalized.includes("loopback") ||
    normalized.includes("tailscale") ||
    normalized.includes("zerotier")
  );
}

function isLikelyUsableHost(address) {
  if (!address || typeof address !== "string") return false;
  const trimmed = address.trim();
  if (!trimmed) return false;
  if (trimmed === "0.0.0.0" || trimmed === "127.0.0.1" || trimmed === "localhost") {
    return false;
  }
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed);
}

function scoreCandidate({ interfaceName, address }) {
  let score = 0;
  if (isPrivateIPv4(address)) {
    score += 100;
  }
  if (address.startsWith("10.") || address.startsWith("192.168.")) {
    score += 25;
  }
  if (isVirtualInterfaceName(interfaceName)) {
    score -= 120;
  }
  return score;
}

function getPrimaryIPv4(preferredHost) {
  if (isLikelyUsableHost(preferredHost)) {
    return String(preferredHost).trim();
  }

  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [interfaceName, entries] of Object.entries(interfaces)) {
    if (!Array.isArray(entries)) continue;
    for (const net of entries) {
      if (!net || net.family !== "IPv4" || net.internal) continue;
      const address = String(net.address || "").trim();
      if (!isLikelyUsableHost(address)) continue;
      candidates.push({
        interfaceName,
        address,
        score: scoreCandidate({ interfaceName, address }),
      });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].address;
}

function buildCastUrls({ localIp, port, sessionId, token }) {
  const encodedToken = encodeURIComponent(token);
  const host = `${localIp}:${port}`;
  return {
    streamUrl: `http://${host}/sessions/${sessionId}/stream/child.m3u8?cast_token=${encodedToken}`,
    sessionUrl: `http://${host}/sessions/${sessionId}?cast_token=${encodedToken}`,
  };
}

function createCastBootstrapService({ logToFile, serverAddr, castHost }) {
  const port = parsePortFromAddr(serverAddr, 6969);
  const loopbackBaseUrl = `http://127.0.0.1:${port}`;

  async function createBootstrap({ sessionId, ttlSeconds = 900 }) {
    if (!sessionId || typeof sessionId !== "string") {
      throw new Error("sessionId is required");
    }

    const localIp = getPrimaryIPv4(castHost);
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
