import { fetchJson } from "./library";
import { sanitizeCatalogTitles } from "./catalogQuality";
import type { PopularTitleMeta } from "./types/popular_types";

export type BrowseType = "movie" | "series";

const CINEMETA_BASE_URL = "https://v3-cinemeta.strem.io";

const SHARED_GENRES = [
    "Action",
    "Adventure",
    "Animation",
    "Comedy",
    "Crime",
    "Documentary",
    "Drama",
    "Family",
    "Fantasy",
    "History",
    "Horror",
    "Mystery",
    "Romance",
    "Sci-Fi",
    "Thriller",
    "War",
    "Western",
];

export const BROWSE_GENRES: Record<BrowseType, string[]> = {
    movie: SHARED_GENRES,
    series: [...SHARED_GENRES, "Reality-TV"],
};

export const BROWSE_PAGE_SIZE = 50;

export async function fetchBrowsePage(type: BrowseType, genre: string | null, skip: number): Promise<PopularTitleMeta[]> {
    const extras = [genre ? `genre=${encodeURIComponent(genre)}` : "", skip ? `skip=${skip}` : ""].filter(Boolean).join("&");
    const url = `${CINEMETA_BASE_URL}/catalog/${type}/top${extras ? `/${extras}` : ""}.json`;
    const payload = await fetchJson(url);
    return sanitizeCatalogTitles(Array.isArray(payload?.metas) ? payload.metas : []);
}
