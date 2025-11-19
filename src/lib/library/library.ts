import type {ShowResponse} from "./types/meta_types";

export const getMetaData = async (imdbId: string, type: string) : Promise<ShowResponse> => {
    const metaUrl = `https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`

    const response = await fetch(metaUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch metadata for IMDB ID: ${imdbId}`);
    }

    return await response.json();
}