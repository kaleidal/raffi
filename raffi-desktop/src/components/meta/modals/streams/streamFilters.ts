import type { Addon } from "../../../../lib/db/db";
import {
    buildAudioLanguageBadge,
    detectProvider,
    formatAvailability,
    parsePeerCount,
} from "../../../../lib/streams/streamMetadata";
import { getStreamFailureKey } from "../../../../pages/meta/streamFailures";
import type {
    AudioFilter,
    EnrichedStream,
    ParsedStreamMetadata,
    ResolutionFilter,
    SourceFilter,
    StreamBadge,
    StreamFilterState,
    StreamSortOption,
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
    { label: "Largest file", value: "sizeDesc" },
    { label: "Most peers", value: "peers" },
];

export const SOURCE_FILTERS: Array<{ label: string; value: SourceFilter }> = [
    { label: "All sources", value: "all" },
    { label: "Local", value: "local" },
    { label: "Direct", value: "direct" },
    { label: "Torrent", value: "torrent" },
];

const RESOLUTION_RANKS: Record<string, number> = {
    "2160p": 5,
    "1440p": 4,
    "1080p": 3,
    "720p": 2,
    "480p": 1,
};

function extractLanguageCodes(audioLanguagesLabel: string | null): string[] {
    if (!audioLanguagesLabel) return [];
    const matches = audioLanguagesLabel.match(/\b[A-Z]{2,3}\b/g) || [];
    return Array.from(new Set(matches.map((code) => code.toUpperCase())));
}

function inferDubbedFromLanguages(codes: string[]): boolean {
    if (!codes.length) return false;
    return codes.some((code) => code !== "EN" && code !== "ENG");
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

    return sourceScore + qualityScore + peerScore + hdrScore + sizeScore;
}

function compareBySort(left: EnrichedStream, right: EnrichedStream, sortOption: StreamSortOption) {
    if (sortOption === "quality") {
        return (right.meta.resolutionRank - left.meta.resolutionRank) || ((right.meta.peerCount ?? -1) - (left.meta.peerCount ?? -1));
    }

    if (sortOption === "sizeAsc") {
        return ((left.meta.sizeInMb ?? Number.POSITIVE_INFINITY) - (right.meta.sizeInMb ?? Number.POSITIVE_INFINITY)) || (right.meta.resolutionRank - left.meta.resolutionRank);
    }

    if (sortOption === "sizeDesc") {
        return ((right.meta.sizeInMb ?? -1) - (left.meta.sizeInMb ?? -1)) || (right.meta.resolutionRank - left.meta.resolutionRank);
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
    const codecLabel = /AV1/i.test(fullText)
        ? "AV1"
        : /(?:x265|H\.?(?:265)|HEVC)/i.test(fullText)
            ? "HEVC"
            : /(?:x264|H\.?(?:264))/i.test(fullText)
                ? "H.264"
                : null;

    const audioLabel = /Atmos/i.test(fullText)
        ? "Dolby Atmos"
        : /DDP(?:\s?5\.1)?|DD5\.1/i.test(fullText)
            ? "DDP 5.1"
            : /DTS/i.test(fullText)
                ? "DTS"
                : null;

    const audioLanguagesLabel = buildAudioLanguageBadge(fullText);
    const audioLanguageCodes = extractLanguageCodes(audioLanguagesLabel);
    const audioLanguageLabel = formatAudioLanguageLabel(audioLanguageCodes);
    const inferredDubbedFromLanguage = inferDubbedFromLanguages(audioLanguageCodes);
    const isDubbed = explicitDub || inferredDubbedFromLanguage;

    const sizeMatch = fullText.match(/(\d+(?:\.\d+)?)\s?(GB|MB)/i);
    const sizeLabel = sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}` : null;
    const sizeInMb = parseSizeInMb(sizeLabel);

    const provider = isLocal
        ? "Local"
        : detectProvider(detailText) ||
            detectProvider(fullText) ||
            stream?.name ||
            "Unknown Source";

    const hostLabel = stream?.name && stream.name !== provider ? stream.name : null;

    const availability = formatAvailability(
        fullText.match(/\[([A-Za-z0-9+ ]+)\]/)?.[1] ?? null,
    );

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

    if (availability) {
        statusBadges.push({ label: availability, variant: "accent" });
    }

    if (isLocal) {
        statusBadges.push({ label: "Local", variant: "accent" });
    }

    if (isP2P) {
        statusBadges.push({ label: "Torrent", variant: "outline" });
    }

    if (isDubbed) {
        statusBadges.push({ label: "Dubbed", variant: "outline" });
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
        audioLanguageCodes,
        audioLanguageLabel,
        featureBadges,
        statusBadges,
        peerCount,
        isP2P: isP2PAdjusted,
        sourceType: isLocal ? "local" : isP2PAdjusted ? "torrent" : "direct",
        sizeInMb,
        infoLine: hostLabel ? `Via ${hostLabel}` : null,
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
        if (state.excludeHDR && meta.isHDR) return false;
        if (state.providerFilter !== "all" && meta.providerLabel !== state.providerFilter) {
            return false;
        }
        if (state.sourceFilter !== "all" && meta.sourceType !== state.sourceFilter) {
            return false;
        }
        if (state.excludeDubbed && meta.isDubbed) {
            return false;
        }
        if (state.audioLanguageFilter !== "all" && !meta.audioLanguageCodes.includes(state.audioLanguageFilter)) {
            return false;
        }
        if (state.audioFilter === "original" && meta.isDubbed) return false;
        if (state.audioFilter === "dubbed" && !meta.isDubbed) return false;
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

export function getProviderFilterOptions(enrichedStreams: EnrichedStream[]): string[] {
    const providers = new Set<string>();
    for (const item of enrichedStreams) {
        if (item.meta.providerLabel) {
            providers.add(item.meta.providerLabel);
        }
    }
    return ["all", ...Array.from(providers).sort((a, b) => a.localeCompare(b))];
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

export function areFiltersActive(state: StreamFilterState): boolean {
    return (
        state.resolutionFilter !== "all" ||
        state.providerFilter !== "all" ||
        state.audioFilter !== "all" ||
        state.audioLanguageFilter !== "all" ||
        state.sourceFilter !== "all" ||
        state.sortOption !== "recommended" ||
        state.excludeDubbed ||
        state.excludeHDR
    );
}

export function getActiveFilterLabels(state: StreamFilterState): string[] {
    const labels: string[] = [];

    if (state.audioFilter === "original") labels.push("Original audio");
    if (state.audioFilter === "dubbed") labels.push("Dubbed");
    if (state.audioLanguageFilter !== "all") labels.push(`Language ${state.audioLanguageFilter}`);
    if (state.resolutionFilter !== "all") {
        labels.push(state.resolutionFilter === "other" ? "Other quality" : state.resolutionFilter.toUpperCase());
    }
    if (state.sourceFilter !== "all") labels.push(SOURCE_FILTERS.find((option) => option.value === state.sourceFilter)?.label ?? state.sourceFilter);
    if (state.providerFilter !== "all") labels.push(state.providerFilter);
    if (state.excludeDubbed) labels.push("Hide dubbed");
    if (state.excludeHDR) labels.push("Skip HDR");
    if (state.sortOption !== "recommended") {
        labels.push(STREAM_SORT_OPTIONS.find((option) => option.value === state.sortOption)?.label ?? state.sortOption);
    }

    return labels;
}

export function getStreamCounts(streams: any[]) {
    const localCount = streams.filter((stream) => stream?.raffiSource === "local").length;
    return {
        total: streams.length,
        local: localCount,
        addon: Math.max(0, streams.length - localCount),
    };
}

export type { AudioFilter, ResolutionFilter, SourceFilter, StreamSortOption };
