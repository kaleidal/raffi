import type { PopularTitleMeta } from "../library/types/popular_types";
import { getTraktRecommendations, type TraktRecommendation } from "../db/db";
import { getCachedMetaData } from "../library/metaCache";
import { sanitizeCatalogTitles } from "../library/catalogQuality";
import { mapMetaToPopular } from "./metaToTitle";

export function uniqueTitles(titles: PopularTitleMeta[]) {
    const seen = new Set<string>();
    return titles.filter((title) => {
        if (seen.has(title.imdb_id)) return false;
        seen.add(title.imdb_id);
        return true;
    });
}

export async function fetchRecommendedTitles(): Promise<PopularTitleMeta[]> {
    const traktItems: TraktRecommendation[] = await getTraktRecommendations(24);
    if (!Array.isArray(traktItems) || traktItems.length === 0) {
        return [];
    }

    const enriched = await Promise.all(
        traktItems.map(async (item) => {
            try {
                const meta = await getCachedMetaData(item.imdbId, item.type);
                if (!meta?.meta) return null;
                return mapMetaToPopular(meta.meta);
            } catch {
                return null;
            }
        }),
    );

    const deduped = new Map<string, PopularTitleMeta>();
    for (const item of enriched) {
        if (item && !deduped.has(item.imdb_id)) {
            deduped.set(item.imdb_id, item);
        }
    }

    return sanitizeCatalogTitles(
        Array.from(deduped.values()),
    ).slice(0, 20);
}
