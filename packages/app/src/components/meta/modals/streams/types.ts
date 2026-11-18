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
