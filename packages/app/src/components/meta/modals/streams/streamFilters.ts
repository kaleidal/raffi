import type { Addon } from "../../../../lib/db/db";
import { offersResource } from "../../../../lib/library/addonManifest";
import { getStreamFailureKey } from "../../../../pages/meta/streamFailures";
import { parseStreamMetadata } from "../../../../lib/streams/ranking/streamParsing";
import { compareRecommended, type RankingContext } from "../../../../lib/streams/ranking/streamRanking";
import type { EnrichedStream } from "../../../../lib/streams/ranking/types";
import type {
    ResolutionFilter,
    StreamFilterState,
    StreamSortOption,
    VideoCodecFilter,
    DynamicRangeFilter,
    AvailabilityFilter,
    SizeFilter,
} from "./types";

export const RESOLUTION_FILTERS: Array<{ label: string; value: ResolutionFilter }> = [
    { label: "All", value: "all" },
    { label: "4K", value: "2160p" },
    { label: "1440p", value: "1440p" },
    { label: "1080p", value: "1080p" },
    { label: "720p", value: "720p" },
    { label: "480p", value: "480p" },
    { label: "Other", value: "other" },
];

export const STREAM_SORT_OPTIONS: Array<{ label: string; value: StreamSortOption }> = [
    { label: "Recommended", value: "recommended" },
    { label: "Best quality", value: "quality" },
    { label: "Smallest file", value: "sizeAsc" },
    { label: "Most peers", value: "peers" },
];

export const VIDEO_CODEC_FILTERS: Array<{ label: string; value: VideoCodecFilter }> = [
    { label: "Any codec", value: "all" },
    { label: "H.264", value: "h264" },
    { label: "HEVC", value: "hevc" },
    { label: "AV1", value: "av1" },
    { label: "Other", value: "other" },
];

export const DYNAMIC_RANGE_FILTERS: Array<{ label: string; value: DynamicRangeFilter }> = [
    { label: "Any range", value: "all" },
    { label: "SDR", value: "sdr" },
    { label: "HDR", value: "hdr" },
];

export const AVAILABILITY_FILTERS: Array<{ label: string; value: AvailabilityFilter }> = [
    { label: "Any availability", value: "all" },
    { label: "Cached only", value: "cached" },
];

export const SIZE_FILTERS: Array<{ label: string; value: SizeFilter }> = [
    { label: "Any size", value: "all" },
    { label: "Under 2 GB", value: "2gb" },
    { label: "Under 5 GB", value: "5gb" },
    { label: "Under 10 GB", value: "10gb" },
    { label: "Under 20 GB", value: "20gb" },
];

function compareBySort(left: EnrichedStream, right: EnrichedStream, sortOption: StreamSortOption, context: RankingContext) {
    if (sortOption === "quality") {
        return (right.meta.resolutionRank - left.meta.resolutionRank) || ((right.meta.peerCount ?? -1) - (left.meta.peerCount ?? -1));
    }

    if (sortOption === "sizeAsc") {
        return ((left.meta.sizeInMb ?? Number.POSITIVE_INFINITY) - (right.meta.sizeInMb ?? Number.POSITIVE_INFINITY)) || (right.meta.resolutionRank - left.meta.resolutionRank);
    }

    if (sortOption === "peers") {
        return ((right.meta.peerCount ?? -1) - (left.meta.peerCount ?? -1)) || (right.meta.resolutionRank - left.meta.resolutionRank);
    }

    return compareRecommended(left, right, context);
}

export function getFilteredAddons(addons: Addon[]): Addon[] {
    return addons.filter((addon) => offersResource(addon.manifest, "stream"));
}

export function buildEnrichedStreams(
    streams: any[],
    failedKeys: string[] = [],
): EnrichedStream[] {
    const failedSet = new Set(failedKeys);
    const keyCounts = new Map<string, number>();

    return streams.map((stream, index) => {
        const baseKey =
            stream?.url || stream?.infoHash || `${stream?.name ?? "stream"}-${stream?.fileIdx ?? "na"}`;

        const seen = keyCounts.get(baseKey) ?? 0;
        keyCounts.set(baseKey, seen + 1);

        const key = seen === 0 ? baseKey : `${baseKey}::dup-${seen}-${index}`;
        const failureKey = getStreamFailureKey(stream);

        return {
            key,
            failureKey,
            isFailed: failureKey ? failedSet.has(failureKey) : false,
            stream,
            meta: parseStreamMetadata(stream),
        };
    });
}

export function applyStreamFilters(
    enrichedStreams: EnrichedStream[],
    state: StreamFilterState,
    context: RankingContext,
): EnrichedStream[] {
    const filtered = enrichedStreams.filter(({ meta }) => {
        if (state.dynamicRangeFilter === "hdr" && !meta.isHDR) return false;
        if (state.dynamicRangeFilter === "sdr" && meta.isHDR) return false;
        if (state.videoCodecFilter !== "all") {
            const codec = meta.videoCodec ?? "other";
            if (codec !== state.videoCodecFilter) return false;
        }
        if (state.availabilityFilter === "cached" && meta.isCached !== true) return false;
        if (state.sizeFilter !== "all") {
            const maximums: Record<SizeFilter, number> = {
                all: Number.POSITIVE_INFINITY,
                "2gb": 2 * 1024,
                "5gb": 5 * 1024,
                "10gb": 10 * 1024,
                "20gb": 20 * 1024,
            };
            if (meta.sizeInMb == null || meta.sizeInMb > maximums[state.sizeFilter]) return false;
        }
        if (state.audioLanguageFilter !== "all" && !meta.audioLanguageCodes.includes(state.audioLanguageFilter)) {
            return false;
        }
        if (state.resolutionFilter === "all") return true;
        if (state.resolutionFilter === "other") return !meta.resolution;
        return meta.resolution === state.resolutionFilter;
    });

    return filtered.sort((left, right) => compareBySort(left, right, state.sortOption, context));
}

export function splitStreamsBySource(filteredStreams: EnrichedStream[]) {
    return {
        localFilteredStreams: filteredStreams.filter(
            (item) => item.stream?.raffiSource === "local",
        ),
        addonFilteredStreams: filteredStreams.filter(
            (item) => item.stream?.raffiSource !== "local",
        ),
    };
}

export function getAudioLanguageFilterOptions(enrichedStreams: EnrichedStream[]): string[] {
    const languages = new Set<string>();
    for (const item of enrichedStreams) {
        for (const code of item.meta.audioLanguageCodes) {
            languages.add(code);
        }
    }
    return ["all", ...Array.from(languages).sort((a, b) => a.localeCompare(b))];
}

export function getAvailableStreamFilterOptions(enrichedStreams: EnrichedStream[]) {
    const resolutions = new Set(enrichedStreams.map((item) => item.meta.resolution ?? "other"));
    const codecs = new Set(enrichedStreams.map((item) => item.meta.videoCodec ?? "other"));
    const hasHDR = enrichedStreams.some((item) => item.meta.isHDR);
    const hasSDR = enrichedStreams.some((item) => !item.meta.isHDR);
    const hasCached = enrichedStreams.some((item) => item.meta.isCached === true);
    const hasNonCached = enrichedStreams.some((item) => item.meta.isCached !== true);
    const knownSizes = enrichedStreams
        .map((item) => item.meta.sizeInMb)
        .filter((value): value is number => value != null);
    const sizeLimits: Record<Exclude<SizeFilter, "all">, number> = {
        "2gb": 2 * 1024,
        "5gb": 5 * 1024,
        "10gb": 10 * 1024,
        "20gb": 20 * 1024,
    };

    return {
        resolutions: RESOLUTION_FILTERS.filter((option) => option.value === "all" || resolutions.has(option.value)),
        codecs: VIDEO_CODEC_FILTERS.filter((option) => option.value === "all" || codecs.has(option.value)),
        dynamicRanges: DYNAMIC_RANGE_FILTERS.filter((option) =>
            option.value === "all" || (option.value === "hdr" ? hasHDR : hasSDR)),
        availability: AVAILABILITY_FILTERS.filter((option) =>
            option.value === "all" || (hasCached && hasNonCached)),
        sizes: SIZE_FILTERS.filter((option) => {
            if (option.value === "all") return true;
            const limit = sizeLimits[option.value];
            return knownSizes.some((size) => size <= limit) && knownSizes.some((size) => size > limit);
        }),
    };
}

export type { ResolutionFilter, StreamSortOption };
