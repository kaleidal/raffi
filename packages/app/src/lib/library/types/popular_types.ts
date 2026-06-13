type Trailer = {
    source: string;
    type: string;
};

type Link = {
    name: string;
    category: string;
    url: string;
};

type Popularities = {
    trakt?: number;
    moviedb?: number;
    stremio?: number;
    stremio_lib?: number;
    [key: string]: number | undefined;
};

type BehaviorHints = {
    defaultVideoId: string | null;
    hasScheduledVideos: boolean;
};

export type PopularTitleMeta = {
    imdb_id: string;
    name: string;
    popularities: Popularities;
    type: "movie" | "series";
    cast?: string[];
    description: string;
    genre?: string[];
    imdbRating?: string;
    poster?: string;
    released?: string; // ISO date string
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
    links?: Link[];
    behaviorHints?: BehaviorHints;
    awards?: string;
    runtime?: string;
    dvdRelease?: string | null;
};