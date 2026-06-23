export type IptvFetchOptions = {
    timeoutMs?: number;
    maxBytes?: number;
};

export type IptvFetchText = (url: string, options?: IptvFetchOptions) => Promise<string>;

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;

async function readResponseText(response: Response, maxBytes: number): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) {
        const text = await response.text();
        if (new TextEncoder().encode(text).byteLength > maxBytes) {
            throw new Error("IPTV response exceeded maximum size");
        }
        return text;
    }

    const chunks: Uint8Array[] = [];
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
        chunks.push(value);
    }

    const buffer = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.byteLength;
    }

    return new TextDecoder().decode(buffer);
}

export function validateIptvUrl(url: string): string {
    const trimmed = String(url ?? "").trim();
    if (!trimmed) {
        throw new Error("Enter an IPTV URL");
    }

    let parsed: URL;
    try {
        parsed = new URL(trimmed);
    } catch {
        throw new Error("Enter a valid IPTV URL");
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("Only http and https IPTV URLs are supported");
    }

    return parsed.toString();
}

async function fetchTextWithBrowser(url: string, options: IptvFetchOptions): Promise<string> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            redirect: "follow",
        });

        if (!response.ok) {
            throw new Error(`Fetch failed with HTTP ${response.status}`);
        }

        const contentLength = Number(response.headers.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength > maxBytes) {
            await response.body?.cancel().catch(() => {});
            throw new Error("IPTV response exceeded maximum size");
        }

        return readResponseText(response, maxBytes);
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
            throw new Error("IPTV fetch timed out");
        }
        if (error instanceof TypeError) {
            throw new Error(
                "IPTV fetch failed. If this is the web app, the provider may be blocking browser CORS requests.",
            );
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

export const iptvFetchText: IptvFetchText = async (url, options = {}) => {
    const target = validateIptvUrl(url);
    const requestOptions = {
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
    };
    const electronApi = typeof window !== "undefined" ? (window as any).electronAPI : null;

    if (electronApi?.iptvFetchText) {
        const result = await electronApi.iptvFetchText(target, requestOptions);
        if (result?.ok && typeof result.text === "string") {
            return result.text;
        }
        throw new Error(result?.error || "IPTV fetch failed");
    }

    return fetchTextWithBrowser(target, requestOptions);
};
