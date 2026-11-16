import type { PopularTitleMeta } from "../library/types/popular_types";

const MIN_GENRE_ROW_LENGTH = 6;

export type GenreRow = { genre: string; titles: PopularTitleMeta[] };

export function uniqueTitles(titles: PopularTitleMeta[]) {
    const seen = new Set<string>();
    return titles.filter((title) => {
        if (seen.has(title.imdb_id)) return false;
        seen.add(title.imdb_id);
        return true;
    });
}

/** Gives each title to the first genre row it fits, so rows further down don't repeat the ones above. */
export function distinctGenreRows(
    genres: string[],
    titlesByGenre: Record<string, PopularTitleMeta[]>,
    alreadyShown: PopularTitleMeta[],
): GenreRow[] {
    const seen = new Set(alreadyShown.map((title) => title.imdb_id));
    return genres.flatMap((genre) => {
        const titles = uniqueTitles(titlesByGenre[genre].filter((title) => !seen.has(title.imdb_id)));
        if (titles.length < MIN_GENRE_ROW_LENGTH) return [];
        for (const title of titles) seen.add(title.imdb_id);
        return [{ genre, titles }];
    });
}
