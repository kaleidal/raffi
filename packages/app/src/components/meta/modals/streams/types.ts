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

export type ResolutionFilter =
    | "all"
    | "2160p"
    | "1440p"
    | "1080p"
    | "720p"
    | "480p"
    | "other";

export type StreamSortOption = "recommended" | "quality" | "sizeAsc" | "peers";

export type VideoCodecFilter = "all" | "h264" | "hevc" | "av1" | "other";
export type DynamicRangeFilter = "all" | "sdr" | "hdr";
export type AvailabilityFilter = "all" | "cached";
export type SizeFilter = "all" | "2gb" | "5gb" | "10gb" | "20gb";

export interface StreamFilterState {
    resolutionFilter: ResolutionFilter;
    audioLanguageFilter: string;
    sortOption: StreamSortOption;
    videoCodecFilter: VideoCodecFilter;
    dynamicRangeFilter: DynamicRangeFilter;
    availabilityFilter: AvailabilityFilter;
    sizeFilter: SizeFilter;
}

export interface ReleaseInfo {
    absolute: string | null;
    relative: string | null;
}

export interface EpisodeProgressDetails {
    percent: number;
    timeLeftLabel: string;
    watched: boolean;
}
