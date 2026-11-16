import type { PopularTitleMeta } from "../library/types/popular_types";

const CANDIDATE_POOL = 12;

const isSpotlightable = (title: PopularTitleMeta) =>
    Boolean(title.background && title.logo && title.description && title.trailerStreams?.length);

/** Keeps the current pick while it's still on offer, so Home doesn't reshuffle every time a section loads. */
export function pickSpotlight(
    pools: PopularTitleMeta[][],
    excludeId: string | undefined,
    current: PopularTitleMeta | null,
): PopularTitleMeta | null {
    const candidates = pools
        .flat()
        .filter((title) => title.imdb_id !== excludeId && isSpotlightable(title))
        .slice(0, CANDIDATE_POOL);
    if (current && candidates.some((title) => title.imdb_id === current.imdb_id)) return current;
    return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
}
