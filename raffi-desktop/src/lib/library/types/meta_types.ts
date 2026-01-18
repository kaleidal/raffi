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
    genre: string[];          // original field
    genres: string[];         // duplicate in your JSON
    imdbRating: string | null;
    imdb_id: string;
    name: string;
    popularity: number;
    poster: string | null;
    released: string | null;  // ISO date string
    runtime: string | null;
    status: string | null;
    tvdb_id: number | null;
    type: "series" | "movie" | string;
    writer: string[];         // array in your JSON
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
    PXS_TEST: number;
    EXMD: number;
    ALLIANCE: number;
    EJD: number;
    moviedb: number;
    trakt: number;
    stremio: number;
    stremio_lib: number;
}

export interface Episode {
    name: string;
    season: number;
    number: number;
    firstAired: string | null;   // ISO date string
    tvdb_id: number | null;
    rating: string | number;     // your JSON has string, but some APIs use number
    overview: string | null;
    thumbnail: string | null;
    id: string;
    released: string | null;     // ISO date string
    episode: number;
    description: string | null;
}

export interface Trailer {
    source: string;
    type: string;
}