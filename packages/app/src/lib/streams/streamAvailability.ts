export type StreamPreflightResult =
    | { state: "ready"; status: number | null; totalBytes: number | null }
    | { state: "preparing"; status: number | null }
    | { state: "unavailable"; status: number | null }
    | { state: "indeterminate"; status: number | null }
    | { state: "network-error"; status: null };

type TransportResult = {
    ok: boolean;
    status: number;
    contentType: string;
    totalBytes?: number | null;
    timedOut?: boolean;
    networkError?: boolean;
};

const PREPARING_STATUSES = new Set([202, 425, 429, 503, 504]);

export function classifyStreamPreflight(result: TransportResult): StreamPreflightResult {
    const status = Number.isFinite(result.status) ? result.status : null;
    if (result.networkError || result.timedOut) return { state: "network-error", status: null };
    if (status != null && PREPARING_STATUSES.has(status)) {
        return { state: "preparing", status };
    }

    const contentType = result.contentType.toLowerCase();
    const looksLikeErrorDocument = /(?:application\/json|text\/html|text\/plain)/.test(contentType);
    if (result.ok && !looksLikeErrorDocument) {
        return { state: "ready", status, totalBytes: result.totalBytes ?? null };
    }
    if (result.ok) return { state: "unavailable", status };
    return { state: "unavailable", status };
}

const STATUS_MEDIA_MAX_BYTES = 16 * 1024 * 1024;
const LONG_FORM_MIN_BYTES = 64 * 1024 * 1024;
const MINIMUM_ON_DEMAND_DURATION_SECONDS = 5 * 60;

export function isLikelyProviderStatusMedia(input: {
    expectedSizeBytes: number | null;
    actualSizeBytes?: number | null;
    durationSeconds?: number | null;
}): boolean {
    const expected = input.expectedSizeBytes;
    const actual = input.actualSizeBytes;
    if (
        expected != null &&
        expected >= LONG_FORM_MIN_BYTES &&
        actual != null &&
        actual > 0 &&
        actual <= STATUS_MEDIA_MAX_BYTES &&
        actual / expected <= 0.05
    ) {
        return true;
    }

    const duration = input.durationSeconds;
    return duration != null && duration > 0 && duration < MINIMUM_ON_DEMAND_DURATION_SECONDS;
}

export function getResponseTotalBytes(
    status: number,
    contentRange: string | null,
    contentLength: string | null,
): number | null {
    const rangeTotal = contentRange?.match(/\/\s*(\d+)\s*$/)?.[1];
    if (rangeTotal) {
        const parsed = Number(rangeTotal);
        if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
    }
    if (status === 200 && contentLength) {
        const parsed = Number(contentLength);
        if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
    }
    return null;
}

export function isStreamPreparationPending(
    result: StreamPreflightResult,
    cacheHint: boolean | null,
): boolean {
    if (result.state === "preparing") return true;
    if (cacheHint !== false || result.state !== "unavailable") return false;
    return result.status !== null && result.status !== 401 && result.status !== 403;
}

async function browserPreflight(url: string, timeoutMs: number): Promise<TransportResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            method: "GET",
            headers: { Range: "bytes=0-1" },
            cache: "no-store",
            signal: controller.signal,
        });
        void response.body?.cancel().catch(() => {});
        return {
            ok: response.ok,
            status: response.status,
            contentType: response.headers.get("content-type") ?? "",
            totalBytes: getResponseTotalBytes(
                response.status,
                response.headers.get("content-range"),
                response.headers.get("content-length"),
            ),
        };
    } catch (error) {
        if (controller.signal.aborted) {
            return { ok: false, status: 0, contentType: "", timedOut: true };
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

export async function preflightStreamUrl(
    url: string,
    timeoutMs = 3500,
): Promise<StreamPreflightResult> {
    const desktopApi = typeof window === "undefined"
        ? undefined
        : (window as any).electronAPI as
            | { preflightStream?: (target: string, timeout: number) => Promise<TransportResult> }
            | undefined;

    try {
        const transport = desktopApi?.preflightStream
            ? await desktopApi.preflightStream(url, timeoutMs)
            : await browserPreflight(url, timeoutMs);
        return classifyStreamPreflight(transport);
    } catch {
        return { state: "network-error", status: null };
    }
}
