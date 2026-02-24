import type { Addon } from "../../../../lib/db/db";
import {
    buildAudioLanguageBadge,
    detectProvider,
    formatAvailability,
    parsePeerCount,
} from "../../../../lib/streams/streamMetadata";
import type {
    AudioFilter,
    EnrichedStream,
    ParsedStreamMetadata,
    ResolutionFilter,
    StreamBadge,
    StreamFilterState,
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

function extractLanguageCodes(audioLanguagesLabel: string | null): string[] {
    if (!audioLanguagesLabel) return [];
    const matches = audioLanguagesLabel.match(/\b[A-Z]{2,3}\b/g) || [];
    return Array.from(new Set(matches.map((code) => code.toUpperCase())));
}

function inferDubbedFromLanguages(codes: string[]): boolean {
    if (!codes.length) return false;
    return codes.some((code) => code !== "EN" && code !== "ENG");
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

    const hasDolbyVision = /Dolby\s?Vision|\bDV\b/i.test(fullText);
    const hasHDR = /HDR/i.test(fullText) || hasDolbyVision;
    const explicitDub =
        /(dubbed|\bdub\b|dual\s*audio|multi\s*audio|multi-audio|\bdual\b)/i.test(
            fullText,
        );
    const explicitSub = /(subbed|\bsubs?\b|softsub|hardsub|\bsub\b)/i.test(fullText);

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
    const inferredDubbedFromLanguage = inferDubbedFromLanguages(audioLanguageCodes);
    const isDubbed = explicitDub || inferredDubbedFromLanguage;
    const isSubbed = explicitSub;

    const sizeMatch = fullText.match(/(\d+(?:\.\d+)?)\s?(GB|MB)/i);
    const sizeLabel = sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}` : null;

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
        statusBadges.push({ label: "LOCAL", variant: "accent" });
    }

    if (isP2P) {
        statusBadges.push({ label: "P2P", variant: "outline" });
    }

    if (isDubbed) {
        statusBadges.push({ label: "DUB", variant: "outline" });
    }

    if (isSubbed) {
        statusBadges.push({ label: "SUB", variant: "outline" });
    }

    const audioLanguagesBadgeLabel = audioLanguagesLabel
        ? isSubbed
            ? `SUB • ${audioLanguagesLabel}`
            : audioLanguagesLabel
        : null;

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
        resolution,
        resolutionLabel,
        isHDR: hasHDR,
        isDubbed,
        isSubbed,
        featureBadges,
        statusBadges,
        peerCount,
        isP2P: isP2PAdjusted,
        infoLine: hostLabel ? `via ${hostLabel}` : null,
    };
}

export function buildEnrichedStreams(streams: any[]): EnrichedStream[] {
    const keyCounts = new Map<string, number>();

    return streams.map((stream, index) => {
        const baseKey =
            stream?.url || stream?.infoHash || `${stream?.name ?? "stream"}-${stream?.fileIdx ?? "na"}`;

        const seen = keyCounts.get(baseKey) ?? 0;
        keyCounts.set(baseKey, seen + 1);

        const key = seen === 0 ? baseKey : `${baseKey}::dup-${seen}-${index}`;

        return {
            key,
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
        if (state.excludeDubbed && meta.isDubbed) {
            return false;
        }
        if (state.ignoreSubbed && meta.isSubbed && !meta.isDubbed) {
            return false;
        }
        if (state.audioFilter === "dubbed" && !meta.isDubbed) return false;
        if (state.audioFilter === "subbed" && !meta.isSubbed) return false;
        if (state.resolutionFilter === "all") return true;
        if (state.resolutionFilter === "other") return !meta.resolution;
        return meta.resolution === state.resolutionFilter;
    });

    const p2p: EnrichedStream[] = [];
    const rest: EnrichedStream[] = [];

    for (const item of filtered) {
        if (item.meta.isP2P) {
            p2p.push(item);
        } else {
            rest.push(item);
        }
    }

    p2p.sort((a, b) => {
        const aPeers = a.meta.peerCount ?? -1;
        const bPeers = b.meta.peerCount ?? -1;
        return bPeers - aPeers;
    });

    return [...p2p, ...rest];
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

export function areFiltersActive(state: StreamFilterState): boolean {
    return (
        state.resolutionFilter !== "all" ||
        state.providerFilter !== "all" ||
        state.audioFilter !== "all" ||
        !state.ignoreSubbed ||
        state.excludeDubbed ||
        state.excludeHDR
    );
}

export function getStreamCounts(streams: any[]) {
    const localCount = streams.filter((stream) => stream?.raffiSource === "local").length;
    return {
        total: streams.length,
        local: localCount,
        addon: Math.max(0, streams.length - localCount),
    };
}

export type { AudioFilter, ResolutionFilter };
