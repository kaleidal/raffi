export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonRecord = Record<string, JsonValue>;

export interface AuthedUser {
  id: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
}

export interface Addon {
  user_id: string;
  added_at: string;
  transport_url: string;
  manifest: JsonValue;
  flags?: JsonValue;
  addon_id: string;
  position?: number;
}

export interface LibraryItem {
  user_id: string;
  imdb_id: string;
  progress: JsonValue;
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
  settings: JsonValue;
  updated_at: string;
}

export interface RemoteState {
  addons: Addon[];
  library: LibraryItem[];
  lists: List[];
  listItems: ListItem[];
  userMeta: UserMeta | null;
}

export interface SyncDeletes {
  addons: string[];
  library: string[];
  lists: string[];
  listItems: Array<{ list_id: string; imdb_id: string }>;
}

export interface SyncPayload {
  addons: Addon[];
  library: LibraryItem[];
  lists: List[];
  listItems: ListItem[];
  userMeta?: Pick<UserMeta, "settings" | "updated_at"> | null;
  deletes: SyncDeletes;
}

export interface TraktIntegration {
  user_id: string;
  username: string | null;
  slug: string | null;
  access_token: string;
  refresh_token: string;
  scope: string | null;
  token_type: string | null;
  expires_at: number | null;
  created_at: string;
  updated_at: string;
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

export interface WatchPartyInfo extends WatchParty {
  memberCount: number;
}
