const CORE_BASE = "http://127.0.0.1:6969";
export const serverUrl = CORE_BASE;

export type SessionKind = "http" | "torrent";

export async function createSession(source: string, kind: SessionKind = "http", startTime: number = 0, fileIdx?: number) {
    const res = await fetch(`${CORE_BASE}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, kind, startTime, fileIdx })
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
    const res = await fetch(`${CORE_BASE}/sessions/${sessionId}/clip`, {
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