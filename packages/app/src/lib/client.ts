const CORE_BASE = "http://127.0.0.1:6969";
export const serverUrl = CORE_BASE;

export type SessionKind = "http" | "torrent";

const AUTH_HEADER = "X-Raffi-Auth";

let cachedDecoderSecret: string | null | undefined;
let ensureDecoderPromise: Promise<void> | null = null;

type ElectronDecoderApi = {
    getDecoderAuthSecret?: () => Promise<string | null>;
    ensureDecoderStarted?: () => Promise<{ ok: boolean; status?: unknown; error?: string }>;
    getDecoderStatus?: () => Promise<{ state?: string } | null>;
};

function getElectronDecoderApi(): ElectronDecoderApi | undefined {
    if (typeof window === "undefined") return undefined;
    return (window as { electronAPI?: ElectronDecoderApi }).electronAPI;
}

async function resolveDecoderSecret(): Promise<string | null> {
    if (cachedDecoderSecret !== undefined) {
        return cachedDecoderSecret;
    }

    try {
        const electronApi = getElectronDecoderApi();
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

/** Starts the Go playback sidecar only when torrent/local/server fallback needs it. */
export async function ensureDecoderStarted(): Promise<void> {
    const electronApi = getElectronDecoderApi();
    if (!electronApi?.ensureDecoderStarted) return;

    if (!ensureDecoderPromise) {
        ensureDecoderPromise = (async () => {
            const result = await electronApi.ensureDecoderStarted!();
            if (!result?.ok) {
                throw new Error(result?.error || "Playback server failed to start");
            }
            clearDecoderAuthCache();
        })().catch((error) => {
            ensureDecoderPromise = null;
            throw error;
        });
    }

    await ensureDecoderPromise;
}

export async function isDecoderReady(): Promise<boolean> {
    const electronApi = getElectronDecoderApi();
    if (!electronApi?.getDecoderStatus) return true;
    try {
        const status = await electronApi.getDecoderStatus();
        return status?.state === "ready";
    } catch {
        return false;
    }
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
    } else {
        await ensureDecoderStarted();
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
    source: string;
    start: number;
    end: number;
    name?: string;
    outputPath?: string;
};

export type CreateClipResponse = {
    outputPath: string;
};

/** In-app clip export via MediaBunny (no Go sidecar session required). */
export async function createClip(req: CreateClipRequest): Promise<CreateClipResponse> {
    const { exportClipWithMediaBunny } = await import("./media/clip");
    const start = Math.max(0, req.start);
    const end = Math.max(start + 0.1, req.end);

    const exported = await exportClipWithMediaBunny({
        source: req.source,
        start,
        end,
    });

    const electronApi = typeof window !== "undefined" ? window.electronAPI : undefined;
    if (req.outputPath && electronApi?.writeClipFile) {
        const copy = exported.bytes.slice();
        const written = await electronApi.writeClipFile(
            req.outputPath,
            copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength),
        );
        if (!written?.ok || !written.filePath) {
            throw new Error(written?.error || "Failed to write clip file");
        }
        return { outputPath: written.filePath };
    }

    // Browser / no save path: download via blob.
    if (typeof document !== "undefined") {
        const copy = exported.bytes.slice();
        const blob = new Blob([copy], { type: exported.mimeType });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = req.name || `clip_${Date.now()}.mp4`;
        anchor.click();
        URL.revokeObjectURL(url);
        return { outputPath: anchor.download };
    }

    throw new Error("No place to save the clip");
}
