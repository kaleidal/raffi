import type { ShowResponse } from "./types/meta_types";
import type { PopularTitleMeta } from "./types/popular_types";

export const getMetaData = async (imdbId: string, type: string): Promise<ShowResponse> => {
    const metaUrl = `https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`

    const response = await fetch(metaUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch metadata for IMDB ID: ${imdbId}`);
    }

    return await response.json();
}

export const getPopularTitles = async (type: string): Promise<PopularTitleMeta[]> => {
    const popularUrl = `https://v3-cinemeta.strem.io/catalog/${type}/popular.json`

    const response = await fetch(popularUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch popular titles for type: ${type}`);
    }

    return (await response.json()).metas;
}

export const searchTitles = async (query: string): Promise<PopularTitleMeta[]> => {
    if (!query) return [];

    const movieUrl = `https://v3-cinemeta.strem.io/catalog/movie/top/search=${encodeURIComponent(query)}.json`;
    const seriesUrl = `https://v3-cinemeta.strem.io/catalog/series/top/search=${encodeURIComponent(query)}.json`;

    try {
        const [movieRes, seriesRes] = await Promise.all([
            fetch(movieUrl),
            fetch(seriesUrl)
        ]);

        const movies = movieRes.ok ? (await movieRes.json()).metas || [] : [];
        const series = seriesRes.ok ? (await seriesRes.json()).metas || [] : [];

        const allResults = [...movies, ...series];

        return allResults.sort((a, b) => {
            const getScore = (item: PopularTitleMeta) => {
                const popularity = item.popularity || item.popularities?.stremio || 0;
                let year = parseInt(item.year?.split("-")[0] || "0");

                let multiplier = 1;
                if (year < 2000) {
                    multiplier = 0.1; // Hard nerf
                } else if (year < 2015) {
                    multiplier = 0.2; // Softer nerf
                } else if (year < 2010) {
                    multiplier = 0.5; // Softer nerf
                }

                return popularity * multiplier;
            };

            return getScore(b) - getScore(a);
        });
    } catch (e) {
        console.error("Search failed", e);
        return [];
    }
}