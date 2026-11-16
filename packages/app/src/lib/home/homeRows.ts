import type { PopularTitleMeta } from "../library/types/popular_types";

export function uniqueTitles(titles: PopularTitleMeta[]) {
    const seen = new Set<string>();
    return titles.filter((title) => {
        if (seen.has(title.imdb_id)) return false;
        seen.add(title.imdb_id);
        return true;
    });
}
