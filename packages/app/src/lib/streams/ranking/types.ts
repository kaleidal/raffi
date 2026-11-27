export interface StreamBadge {
    label: string;
    variant?: "accent" | "muted" | "outline" | "danger";
}

export interface ParsedStreamMetadata {
    providerLabel: string;
    hostLabel: string | null;
    availabilityLabel: string | null;
    resolution: string | null;
    resolutionLabel: string | null;
    resolutionRank: number;
    isHDR: boolean;
    isDolbyVisionOnly: boolean;
    isDubbed: boolean;
    videoCodec: "h264" | "hevc" | "av1" | "other" | null;
    releaseTypeLabel: string | null;
    audioFormatLabel: string | null;
    isCached: boolean | null;
    debridServiceLabel: string | null;
    debridDashboardUrl: string | null;
    audioLanguageCodes: string[];
    audioLanguageLabel: string | null;
    featureBadges: StreamBadge[];
    statusBadges: StreamBadge[];
    peerCount: number | null;
    isP2P: boolean;
    sourceType: "local" | "torrent" | "direct";
    sizeInMb: number | null;
    infoLine: string | null;
}

export interface EnrichedStream {
    key: string;
    failureKey: string | null;
    isFailed: boolean;
    stream: any;
    meta: ParsedStreamMetadata;
}
