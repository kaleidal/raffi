import {
    detectProvider,
    extractAudioLanguageCodes,
    formatAvailability,
    parseDebridAvailability,
    parsePeerCount,
} from "../streamMetadata";
import { isWeb } from "../../shell/platform";
import { RESOLUTION_RANKS } from "./streamRanking";
import type { ParsedStreamMetadata, StreamBadge } from "./types";

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

    const resolutionLabel = resolution === "2160p" ? "4K" : resolution;
    const resolutionRank = resolution ? (RESOLUTION_RANKS[resolution] ?? 0) : 0;

    const hasDolbyVision = /Dolby\s?Vision|\bDV\b/i.test(fullText);
    const hasHDR = /HDR/i.test(fullText) || hasDolbyVision;
    const isDolbyVisionOnly = hasDolbyVision && !/HDR/i.test(fullText);
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
        isDolbyVisionOnly,
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
