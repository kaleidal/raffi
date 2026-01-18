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

export const searchTitles = async (query: string): Promise<any[]> => {
    if (!query) return [];

    const url = `https://imdb.iamidiotareyoutoo.com/search?q=${encodeURIComponent(query)}&tt=&lsn=1&v=1`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        return data.description || [];
    } catch (e) {
        console.error("Search failed", e);
        return [];
    }
}