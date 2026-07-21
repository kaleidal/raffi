const CORE_BASE = "http://127.0.0.1:6969";
export const serverUrl = CORE_BASE;

export type SessionKind = "http" | "torrent";

const AUTH_HEADER = "X-Raffi-Auth";

let cachedDecoderSecret: string | null | undefined;

async function resolveDecoderSecret(): Promise<string | null> {
    if (cachedDecoderSecret !== undefined) {
        return cachedDecoderSecret;
    }

    try {
        const electronApi = (window as any)?.electronAPI as
            | { getDecoderAuthSecret?: () => Promise<string | null> }
            | undefined;
        if (electronApi?.getDecoderAuthSecret) {
            cachedDecoderSecret = (await electronApi.getDecoderAuthSecret()) || null;
            return cachedDecoderSecret;
        }
    } catch {
        // Fall through — non-desktop or IPC unavailable.
    }

    cachedDecoderSecret = null;
    return null;
}

export function clearDecoderAuthCache() {
    cachedDecoderSecret = undefined;
}

export async function decoderHeaders(extra?: HeadersInit): Promise<Headers> {
    const headers = new Headers(extra);
    const secret = await resolveDecoderSecret();
    if (secret) {
        headers.set(AUTH_HEADER, secret);
    }
    return headers;
}

export async function decoderFetch(input: string, init: RequestInit = {}): Promise<Response> {
    const headers = await decoderHeaders(init.headers);
    return fetch(input, { ...init, headers });
}

export async function createSession(source: string, kind: SessionKind = "http", startTime: number = 0, fileIdx?: number, options?: { prefetch?: boolean }) {
    if (kind === "torrent") {
        const { ensureTorrentingAllowed } = await import("./stores/torrenting");
        await ensureTorrentingAllowed();
    }
    const res = await decoderFetch(`${CORE_BASE}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, kind, startTime, fileIdx, prefetch: options?.prefetch === true })
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`createSession failed: ${res.status} ${text}`);
    }

    const data = await res.json() as { id: string };
    return data.id;
}

export function getStreamUrl(sessionId: string) {
    return `${CORE_BASE}/sessions/${sessionId}/stream`;
}

export function getSessionUrl(sessionId: string) {
    return `${CORE_BASE}/sessions/${sessionId}`;
}

export type CreateClipRequest = {
    start: number;
    end: number;
    name?: string;
    outputPath?: string;
};

export type CreateClipResponse = {
    outputPath: string;
};

export async function createClip(sessionId: string, req: CreateClipRequest): Promise<CreateClipResponse> {
    const res = await decoderFetch(`${CORE_BASE}/sessions/${sessionId}/clip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`createClip failed: ${res.status} ${text}`);
    }

    return (await res.json()) as CreateClipResponse;
}
