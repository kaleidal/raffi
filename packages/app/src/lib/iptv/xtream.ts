import type { IptvXtreamSource } from "./types";

const XTREAM_URL_PROTOCOL_ERROR = "Only http and https Xtream server URLs are supported";

export function normalizeXtreamServerUrl(url: string): string {
    const trimmed = String(url ?? "").trim();
    if (!trimmed) {
        throw new Error("Enter an Xtream server URL");
    }

    let parsed: URL;
    try {
        parsed = new URL(trimmed);
    } catch {
        throw new Error("Enter a valid Xtream server URL");
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(XTREAM_URL_PROTOCOL_ERROR);
    }

    parsed.search = "";
    parsed.hash = "";

    const pathname = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${pathname}`;
}

export function requireXtreamField(value: string, label: string): string {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) {
        throw new Error(`Enter an Xtream ${label}`);
    }
    return trimmed;
}

function buildXtreamUrl(
    source: Pick<IptvXtreamSource, "serverUrl" | "username" | "credential">,
    path: "get.php" | "xmltv.php",
    extraParams: Record<string, string> = {},
): string {
    const serverUrl = normalizeXtreamServerUrl(source.serverUrl);
    const username = requireXtreamField(source.username, "username");
    const credential = requireXtreamField(source.credential, "password");
    const params = new URLSearchParams();
    params.set("username", username);
    params.set("password", credential);
    for (const [key, value] of Object.entries(extraParams)) {
        params.set(key, value);
    }

    return `${serverUrl}/${path}?${params.toString()}`;
}

export function buildXtreamPlaylistUrl(
    source: Pick<IptvXtreamSource, "serverUrl" | "username" | "credential">,
): string {
    return buildXtreamUrl(source, "get.php", {
        type: "m3u_plus",
        output: "ts",
    });
}

export function buildXtreamXmltvUrl(
    source: Pick<IptvXtreamSource, "serverUrl" | "username" | "credential">,
): string {
    return buildXtreamUrl(source, "xmltv.php");
}
