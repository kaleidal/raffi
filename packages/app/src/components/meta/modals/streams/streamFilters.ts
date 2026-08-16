import type { Addon } from "../../../../lib/db/db";
import {
    detectProvider,
    extractAudioLanguageCodes,
    formatAvailability,
    parseDebridAvailability,
    parsePeerCount,
} from "../../../../lib/streams/streamMetadata";
import { isWeb } from "../../../../lib/platform";
import { getStreamFailureKey } from "../../../../pages/meta/streamFailures";
import type {
    EnrichedStream,
    ParsedStreamMetadata,
    ResolutionFilter,
    StreamBadge,
    StreamFilterState,
    StreamSortOption,
    VideoCodecFilter,
    DynamicRangeFilter,
    AvailabilityFilter,
    SizeFilter,
} from "./types";

export const RESOLUTION_FILTERS: Array<{ label: string; value: ResolutionFilter }> = [
    { label: "All", value: "all" },
    { label: "2160p", value: "2160p" },
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

const RESOLUTION_RANKS: Record<string, number> = {
    "2160p": 5,
    "1440p": 4,
    "1080p": 3,
    "720p": 2,
    "480p": 1,
};

function detectWebDolbyRiskLabel(text: string): string | null {
    if (!isWeb) return null;
    if (/\b(?:E-?AC-?3|EC-?3|DDP|DD\+|Dolby\s*Digital\s*Plus)\b/i.test(text)) {
        return "Dolby";
    }
    if (/\b(?:Atmos|TrueHD|Dolby\s*TrueHD|AC-?3|DD5\.1|Dolby\s*Digital)\b/i.test(text)) {
        return "Dolby";
    }
    if (/\bDTS(?:-?HD|:X)?\b/i.test(text)) {
        return "DTS";
    }
    return null;
}

function parseSizeInMb(sizeLabel: string | null): number | null {
    if (!sizeLabel) return null;
    const match = sizeLabel.match(/(\d+(?:\.\d+)?)\s?(GB|MB)/i);
    if (!match) return null;
    const value = Number.parseFloat(match[1]);
    if (!Number.isFinite(value)) return null;
    return match[2].toUpperCase() === "GB" ? value * 1024 : value;
}

function formatAudioLanguageLabel(codes: string[]): string | null {
    if (!codes.length) return null;
    const visible = codes.slice(0, 4);
    const remainder = codes.length - visible.length;
    return `${visible.join(" + ")}${remainder > 0 ? ` +${remainder}` : ""}`;
}

function getRecommendedScore(meta: ParsedStreamMetadata): number {
    const sourceScore =
        meta.sourceType === "local"
            ? 5000
            : meta.availabilityLabel
                ? 3400
                : meta.sourceType === "direct"
                    ? 2600
                    : 1800;

    const qualityScore = meta.resolutionRank * 200;
    const peerScore = Math.min(meta.peerCount ?? 0, 999);
    const hdrScore = meta.isHDR ? 25 : 0;
    const sizeScore = meta.sizeInMb ? Math.min(meta.sizeInMb / 256, 40) : 0;

    const cachedScore = meta.isCached === true ? 1200 : 0;

    return sourceScore + cachedScore + qualityScore + peerScore + hdrScore + sizeScore;
}

function compareBySort(left: EnrichedStream, right: EnrichedStream, sortOption: StreamSortOption) {
    if (sortOption === "quality") {
        return (right.meta.resolutionRank - left.meta.resolutionRank) || ((right.meta.peerCount ?? -1) - (left.meta.peerCount ?? -1));
    }

    if (sortOption === "sizeAsc") {
        return ((left.meta.sizeInMb ?? Number.POSITIVE_INFINITY) - (right.meta.sizeInMb ?? Number.POSITIVE_INFINITY)) || (right.meta.resolutionRank - left.meta.resolutionRank);
    }

    if (sortOption === "peers") {
        return ((right.meta.peerCount ?? -1) - (left.meta.peerCount ?? -1)) || (right.meta.resolutionRank - left.meta.resolutionRank);
    }

    return getRecommendedScore(right.meta) - getRecommendedScore(left.meta);
}

export function getFilteredAddons(addons: Addon[]): Addon[] {
    return addons.filter((addon) => {
        if (!addon.manifest || !addon.manifest.resources) return false;
        return addon.manifest.resources.some(
            (resource: any) =>
                (typeof resource === "object" && resource.name === "stream") ||
                resource === "stream",
        );
    });
}

export function parseStreamMetadata(stream: any): ParsedStreamMetadata {
    const isLocal = stream?.raffiSource === "local";
    const isDirectSource = stream?.raffiSource === "direct";
    const title = stream?.title ?? "";
    const description = stream?.description ?? "";
    const behaviorFilename = stream?.behaviorHints?.filename ?? "";
    const behaviorGroup = stream?.behaviorHints?.bingeGroup ?? "";

    const primaryText = [title, description]
        .map((value) => String(value ?? ""))
        .filter(Boolean)
        .join("\n");

    const lines = primaryText
        .split("\n")
        .map((line: string) => line.trim())
        .filter(Boolean);

    const detailText = lines.slice(1).join(" ") || lines.join(" ");
    const fullText = `${primaryText} ${stream?.name ?? ""} ${behaviorFilename} ${behaviorGroup}`;

    const resolutionMatch = fullText.match(/(2160|1440|1080|720|540|480|360|240)p/i);
    let resolution: string | null = resolutionMatch ? `${resolutionMatch[1]}p` : null;
    if (!resolution && /4k/i.test(fullText)) {
        resolution = "2160p";
    }

    const resolutionLabel = resolution
        ? resolution === "2160p" && /4k/i.test(fullText)
            ? "4K"
            : resolution.toUpperCase()
        : null;
    const resolutionRank = resolution ? (RESOLUTION_RANKS[resolution] ?? 0) : 0;

    const hasDolbyVision = /Dolby\s?Vision|\bDV\b/i.test(fullText);
    const hasHDR = /HDR/i.test(fullText) || hasDolbyVision;
    const explicitDub =
        /(dubbed|\bdub\b|dual\s*audio|multi\s*audio|multi-audio|\bdual\b)/i.test(
            fullText,
        );
    const videoCodec = /\bAV1\b/i.test(fullText)
        ? "av1"
        : /(?:x265|H\.?(?:265)|HEVC)/i.test(fullText)
            ? "hevc"
            : /(?:x264|H\.?(?:264)|\bavc\b)/i.test(fullText)
                ? "h264"
                : null;
    const codecLabel = videoCodec === "av1"
        ? "AV1"
        : videoCodec === "hevc"
            ? "HEVC"
            : videoCodec === "h264"
                ? "H.264"
                : null;

    const audioLabel = /Atmos/i.test(fullText)
        ? "Dolby Atmos"
        : /TrueHD/i.test(fullText)
            ? "Dolby TrueHD"
            : /(?:DDP|E-?AC-?3|Dolby Digital Plus)/i.test(fullText)
                ? "Dolby Digital Plus"
                : /(?:DD5\.1|\bAC-?3\b|Dolby Digital)/i.test(fullText)
                    ? "Dolby Digital"
                    : /DTS/i.test(fullText)
                        ? "DTS"
                        : /\bAAC\b/i.test(fullText)
                            ? "AAC"
                            : /\bFLAC\b/i.test(fullText)
                                ? "FLAC"
                                : null;

    const webDolbyRiskLabel = detectWebDolbyRiskLabel(fullText);
    const audioLanguageCodes = extractAudioLanguageCodes(
        primaryText,
        behaviorFilename || lines[0] || null,
    );
    const audioLanguageLabel = formatAudioLanguageLabel(audioLanguageCodes);
    const isDubbed = explicitDub;

    const sizeMatch = fullText.match(/(\d+(?:\.\d+)?)\s?(GB|MB)/i);
    const hintedSizeBytes = Number(stream?.behaviorHints?.videoSize);
    const sizeInMb = Number.isFinite(hintedSizeBytes) && hintedSizeBytes > 0
        ? hintedSizeBytes / (1024 * 1024)
        : parseSizeInMb(sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}` : null);
    const sizeLabel = sizeInMb == null
        ? null
        : sizeInMb >= 1024
            ? `${(sizeInMb / 1024).toFixed(sizeInMb >= 10240 ? 0 : 1)} GB`
            : `${Math.round(sizeInMb)} MB`;

    const releaseTypeLabel = /\bREMUX\b/i.test(fullText)
        ? "Remux"
        : /BluRay|Blu-Ray|BDRip/i.test(fullText)
            ? "BluRay"
            : /WEB[ ._-]?(?:DL|Mux)/i.test(fullText)
                ? "WEB-DL"
                : /WEBRip/i.test(fullText)
                    ? "WEBRip"
                    : /HDTV/i.test(fullText)
                        ? "HDTV"
                        : /DVDRip|DVD-Rip/i.test(fullText)
                            ? "DVDRip"
                            : /\bCAM\b|HDCAM/i.test(fullText)
                                ? "CAM"
                                : null;

    const provider = isLocal
        ? "Local"
        : detectProvider(detailText) ||
            detectProvider(fullText) ||
            stream?.name ||
            "Unknown Source";

    const normalizedHostLabel = String(stream?.name ?? "")
        .split("\n")[0]
        .replace(/^\[[^\]]+\]\s*/, "")
        .replace(/\s+(?:2160|1440|1080|720|540|480|360|240)p$/i, "")
        .trim();
    const hostLabel = normalizedHostLabel && normalizedHostLabel !== provider
        ? normalizedHostLabel
        : null;

    const availabilityToken = String(stream?.name ?? "").match(/^\[([^\]]+)\]/)?.[1] ?? null;
    const {
        serviceLabel: debridServiceLabel,
        dashboardUrl: debridDashboardUrl,
        isCached,
    } = parseDebridAvailability(availabilityToken);
    const availability = debridServiceLabel || formatAvailability(availabilityToken);

    const isP2P =
        !isLocal &&
        (Boolean(stream?.infoHash) || Boolean(stream?.url && stream.url.startsWith("magnet:")));

    const peerCount = parsePeerCount(detailText);
    const isP2PAdjusted = isP2P || peerCount != null;

    const featureBadges: StreamBadge[] = [];
    const statusBadges: StreamBadge[] = [];
    const seen = new Set<string>();

    const addFeature = (label?: string | null, variant?: "accent" | "muted") => {
        if (!label) return;
        const key = label.toUpperCase();
        if (seen.has(key)) return;
        seen.add(key);
        featureBadges.push({ label, variant });
    };

    if (isCached === true) {
        statusBadges.push({ label: "Cached", variant: "accent" });
    }

    if (isLocal) {
        statusBadges.push({ label: "Local", variant: "accent" });
    }

    if (isDirectSource) {
        statusBadges.push({
            label: stream?.directPlaybackMode === "iframe" ? "Iframe" : "Direct",
            variant: "accent",
        });
    }

    if (isP2P) {
        statusBadges.push({ label: "Torrent", variant: "outline" });
    }

    if (isDubbed) {
        statusBadges.push({ label: "Dubbed", variant: "outline" });
    }

    if (webDolbyRiskLabel) {
        statusBadges.push({ label: webDolbyRiskLabel, variant: "danger" });
    }

    const audioLanguagesBadgeLabel = audioLanguageLabel ? `Audio ${audioLanguageLabel}` : null;

    addFeature(resolutionLabel);
    if (hasDolbyVision) {
        addFeature("Dolby Vision");
    } else if (hasHDR) {
        addFeature("HDR");
    }
    addFeature(codecLabel);
    addFeature(audioLabel);
    addFeature(releaseTypeLabel);
    addFeature(audioLanguagesBadgeLabel, "accent");
    addFeature(sizeLabel, "muted");

    return {
        providerLabel: provider,
        hostLabel,
        availabilityLabel: availability,
        resolution,
        resolutionLabel,
        resolutionRank,
        isHDR: hasHDR,
        isDubbed,
        videoCodec: videoCodec ?? null,
        releaseTypeLabel,
        audioFormatLabel: audioLabel,
        isCached,
        debridServiceLabel,
        debridDashboardUrl,
        audioLanguageCodes,
        audioLanguageLabel,
        featureBadges,
        statusBadges,
        peerCount,
        isP2P: isP2PAdjusted,
        sourceType: isLocal ? "local" : isP2PAdjusted ? "torrent" : "direct",
        sizeInMb,
        infoLine: [debridServiceLabel, hostLabel, releaseTypeLabel].filter(Boolean).length
            ? `Via ${Array.from(new Set([debridServiceLabel, hostLabel, releaseTypeLabel].filter(Boolean))).join(" · ")}`
            : hostLabel
                ? `Via ${hostLabel}`
                : null,
    };
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

    return [...filtered].sort((left, right) => compareBySort(left, right, state.sortOption));
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

export function areFiltersActive(state: StreamFilterState): boolean {
    return (
        state.resolutionFilter !== "all" ||
        state.audioLanguageFilter !== "all" ||
        state.sortOption !== "recommended" ||
        state.videoCodecFilter !== "all"
        || state.dynamicRangeFilter !== "all"
        || state.availabilityFilter !== "all"
        || state.sizeFilter !== "all"
    );
}

export function getActiveFilterLabels(state: StreamFilterState): string[] {
    const labels: string[] = [];

    if (state.audioLanguageFilter !== "all") labels.push(`Language ${state.audioLanguageFilter}`);
    if (state.resolutionFilter !== "all") {
        labels.push(state.resolutionFilter === "other" ? "Other quality" : state.resolutionFilter.toUpperCase());
    }
    if (state.videoCodecFilter !== "all") labels.push(state.videoCodecFilter.toUpperCase());
    if (state.dynamicRangeFilter !== "all") labels.push(state.dynamicRangeFilter.toUpperCase());
    if (state.availabilityFilter === "cached") labels.push("Cached only");
    if (state.sizeFilter !== "all") labels.push(`Under ${state.sizeFilter.toUpperCase()}`);
    if (state.sortOption !== "recommended") {
        labels.push(STREAM_SORT_OPTIONS.find((option) => option.value === state.sortOption)?.label ?? state.sortOption);
    }

    return labels;
}

export function getStreamCounts(streams: any[]) {
    const localCount = streams.filter((stream) => stream?.raffiSource === "local").length;
    const directCount = streams.filter((stream) => stream?.raffiSource === "direct").length;
    return {
        total: streams.length,
        local: localCount,
        addon: Math.max(0, streams.length - localCount - directCount),
        direct: directCount,
    };
}

export type { ResolutionFilter, StreamSortOption };
