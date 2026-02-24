export interface StreamBadge {
    label: string;
    variant?: "accent" | "muted" | "outline";
}

export interface ParsedStreamMetadata {
    providerLabel: string;
    hostLabel: string | null;
    resolution: string | null;
    resolutionLabel: string | null;
    isHDR: boolean;
    isDubbed: boolean;
    isSubbed: boolean;
    featureBadges: StreamBadge[];
    statusBadges: StreamBadge[];
    peerCount: number | null;
    isP2P: boolean;
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

export type AudioFilter = "all" | "dubbed" | "subbed";

export interface StreamFilterState {
    resolutionFilter: ResolutionFilter;
    providerFilter: string;
    audioFilter: AudioFilter;
    ignoreSubbed: boolean;
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
