export function extractYouTubeId(value: unknown): string | null {
    const raw = String(value || "").trim();
    if (!raw) return null;
    if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;

    try {
        const url = new URL(raw);
        const hostname = url.hostname.toLowerCase();
        if (hostname === "youtube.com" || hostname.endsWith(".youtube.com")) {
            const id = url.searchParams.get("v");
            if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return id;
        }
        if (hostname === "youtu.be") {
            const id = url.pathname.replace(/^\//, "");
            if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return id;
        }
    } catch {
        return null;
    }

    return null;
}

export function getPrimaryTrailerId(entry: {
    trailerStreams?: Array<{ ytId?: string | null }>;
    trailers?: Array<{ source?: string | null }>;
} | null | undefined): string | null {
    const trailerStreamId = String(entry?.trailerStreams?.[0]?.ytId || "").trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(trailerStreamId)) {
        return trailerStreamId;
    }

    return extractYouTubeId(entry?.trailers?.[0]?.source);
}