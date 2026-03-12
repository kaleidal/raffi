export interface Addon {
    user_id: string;
    added_at: string;
    transport_url: string;
    manifest: any;
    flags: any;
    addon_id: string;
    position?: number;
}

export interface LibraryItem {
    user_id: string;
    imdb_id: string;
    progress: any;
    last_watched: string;
    completed_at: string | null;
    type: string;
    shown: boolean;
    poster?: string;
}

export interface List {
    list_id: string;
    user_id: string;
    created_at: string;
    name: string;
    position: number;
}

export interface ListItem {
    list_id: string;
    imdb_id: string;
    position: number;
    type: string;
    poster?: string;
}

export interface UserMeta {
    user_id: string;
    settings: any;
}

export interface WatchParty {
    party_id: string;
    host_user_id: string;
    imdb_id: string;
    season: number | null;
    episode: number | null;
    stream_source: string;
    file_idx: number | null;
    created_at: string;
    expires_at: string;
    current_time_seconds: number;
    is_playing: boolean;
    last_update: string;
}

export interface WatchPartyMember {
    party_id: string;
    user_id: string;
    joined_at: string;
    last_seen: string;
}

export interface TraktStatus {
    configured: boolean;
    clientId: string | null;
    redirectUri: string;
    authorizeUrl: string;
    connected: boolean;
    username: string | null;
    slug: string | null;
    scope: string | null;
    updatedAt: string | null;
    expiresAt: number | null;
}

export interface TraktScrobbleArgs {
    action: "start" | "pause" | "stop";
    imdbId: string;
    mediaType: "movie" | "episode";
    season?: number;
    episode?: number;
    progress: number;
    appVersion?: string;
}

export interface TraktRecommendation {
    imdbId: string;
    type: "movie" | "series";
    title?: string | null;
    year?: number | null;
}

export type RemoteState = {
    addons: Addon[];
    library: LibraryItem[];
    lists: List[];
    listItems: ListItem[];
};

export type RemoteStateSection = "addons" | "library" | "lists" | "listItems";

export type RemoteStateChunkResponse<T> = {
    section: RemoteStateSection;
    items: T[];
    total: number;
    nextOffset: number;
    done: boolean;
};

export type SyncSection = "addons" | "library" | "lists" | "listItems";

export type SyncStateSectionMap = Record<SyncSection, Record<string, number>>;

export type CloudSyncState = {
    dirty: SyncStateSectionMap;
    tombstones: SyncStateSectionMap;
    lastAttemptAt: number | null;
    lastSuccessAt: number | null;
    lastError: string | null;
    reachability: "unknown" | "online" | "offline";
};

export type CloudSyncStatus = {
    backupEnabled: boolean;
    cloudFeaturesAvailable: boolean;
    reachability: "unknown" | "online" | "offline";
    isSyncing: boolean;
    pendingUploads: number;
    pendingDeletes: number;
    lastAttemptAt: number | null;
    lastSuccessAt: number | null;
    lastError: string | null;
    localBackupReady: boolean;
};