import type { Stream } from "../types";
import type { EnrichedStream } from "./types";

export function withAvailabilityHint({ stream, meta }: EnrichedStream): Stream {
    return {
        ...stream,
        raffiAvailability: {
            cacheHint: meta.isCached,
            providerLabel: meta.debridServiceLabel,
            dashboardUrl: meta.debridDashboardUrl,
            expectedSizeBytes: meta.sizeInMb == null ? null : meta.sizeInMb * 1024 * 1024,
        },
    };
}
