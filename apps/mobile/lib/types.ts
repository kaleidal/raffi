// Meta Types (matching desktop app)
export interface ShowResponse {
  meta: Meta;
}

export interface Meta {
  awards: string | null;
  cast: string[];
  country: string | null;
  description: string | null;
  director: string | null;
  dvdRelease: string | null;
  genre: string[];
  genres: string[];
  imdbRating: string | null;
  imdb_id: string;
  name: string;
  popularity: number;
  poster: string | null;
  released: string | null;
  runtime: string | null;
  status: string | null;
  tvdb_id: number | null;
  type: 'series' | 'movie' | string;
  writer: string[];
  year: string | null;
  background: string | null;
  logo: string | null;
  trailers: Trailer[];
  popularities: Popularities;
  moviedb_id: number | null;
  slug: string;
  id: string;
  releaseInfo: string | null;
  videos: Episode[];
}

export interface Popularities {
  moviedb?: number;
  trakt?: number;
  stremio?: number;
  stremio_lib?: number;
  [key: string]: number | undefined;
}

export interface Episode {
  name: string;
  season: number;
  number: number;
  firstAired: string | null;
  tvdb_id: number | null;
  rating: string | number;
  overview: string | null;
  thumbnail: string | null;
  id: string;
  released: string | null;
  episode: number;
  description: string | null;
}

export interface Trailer {
  source: string;
  type: string;
}

// Popular Types
export type PopularTitleMeta = {
  imdb_id: string;
  name: string;
  popularities: Popularities;
  type: 'movie' | 'series';
  cast?: string[];
  description: string;
  genre?: string[];
  imdbRating?: string;
  poster?: string;
  released?: string;
  slug: string;
  year?: string;
  director?: string[] | null;
  writer?: string[] | null;
  trailers?: Trailer[];
  status?: string;
  background?: string;
  logo?: string;
  popularity?: number;
  id: string;
  genres?: string[];
  releaseInfo?: string;
  trailerStreams?: { title: string; ytId: string }[];
  awards?: string;
  runtime?: string;
};

// Stream Types
export interface Stream {
  name?: string;
  title?: string;
  url?: string;
  infoHash?: string;
  fileIdx?: number;
  behaviorHints?: {
    bingeGroup?: string;
    notWebReady?: boolean;
  };
  description?: string;
}

// Database Types
export interface Addon {
  user_id: string;
  added_at: string;
  transport_url: string;
  manifest: any;
  flags: any;
  addon_id: string;
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
