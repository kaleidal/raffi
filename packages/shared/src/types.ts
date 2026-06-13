// Shared types across all Raffi clients

export interface Stream {
  url?: string;
  infoHash?: string;
  name?: string;
  // ... add common fields as we extract
}

export interface Meta {
  id: string;
  type: 'movie' | 'series';
  name: string;
  // ...
}
