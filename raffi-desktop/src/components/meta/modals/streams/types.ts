export interface StreamBadge {
    label: string;
    variant?: "accent" | "muted" | "outline";
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

export type AudioFilter = "all" | "original" | "dubbed";

export type SourceFilter = "all" | "local" | "direct" | "torrent";

export type StreamSortOption = "recommended" | "quality" | "sizeAsc" | "sizeDesc" | "peers";

export interface StreamFilterState {
    resolutionFilter: ResolutionFilter;
    providerFilter: string;
    audioFilter: AudioFilter;
    audioLanguageFilter: string;
    sourceFilter: SourceFilter;
    sortOption: StreamSortOption;
    excludeDubbed: boolean;
    excludeHDR: boolean;
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
