export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface Addon {
  user_id: string;
  added_at: string;
  transport_url: string;
  manifest: JsonValue;
  flags?: JsonValue;
  addon_id: string;
  position?: number;
  updated_at: string;
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
  updated_at: string;
}

export interface List {
  list_id: string;
  user_id: string;
  created_at: string;
  name: string;
  position: number;
  updated_at: string;
}

export interface ListItem {
  list_id: string;
  imdb_id: string;
  position: number;
  type: string;
  poster?: string;
  updated_at: string;
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
  tombstones: SyncTombstone[];
}

export type SyncSection = "addons" | "library" | "lists" | "listItems" | "userMeta";

export interface SyncTombstone {
  section: SyncSection;
  key: string;
  updated_at: string;
}

export interface SyncPayload {
  addons: Addon[];
  library: LibraryItem[];
  lists: List[];
  listItems: ListItem[];
  userMeta?: Pick<UserMeta, "settings" | "updated_at"> | null;
  deletes: SyncTombstone[];
}
