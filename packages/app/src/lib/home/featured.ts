import type { PopularTitleMeta } from "../library/types/popular_types";
import { HOME_HERO_SOURCE_TRAKT_RECOMMENDATIONS } from "./heroSettings";

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

function isHeroCandidate(title: PopularTitleMeta) {
    const year = parseInt(title.year ?? "");
    return (
        Boolean(title.logo) &&
        Array.isArray(title.trailerStreams) &&
        title.trailerStreams.length > 0 &&
        year >= 2010
    );
}

function chooseRandom(items: PopularTitleMeta[]) {
    if (items.length === 0) return undefined;
    return items[Math.floor(Math.random() * items.length)];
}

const getTitleKey = (title: PopularTitleMeta | null | undefined) =>
    title ? `${title.type}:${title.imdb_id || title.id}` : "";

function includesTitle(items: PopularTitleMeta[], current: PopularTitleMeta | null) {
    const currentKey = getTitleKey(current);
    if (!currentKey) return false;
    return items.some((title) => getTitleKey(title) === currentKey);
}

export function pickHeroTitle(
    heroPoolTitles: PopularTitleMeta[],
    popularTitles: PopularTitleMeta[],
    current: PopularTitleMeta | null,
    sourceId: string,
    options: { preserveCurrent?: boolean } = {},
): PopularTitleMeta | null {
    if (
        sourceId === HOME_HERO_SOURCE_TRAKT_RECOMMENDATIONS &&
        heroPoolTitles.length > 0
    ) {
        const traktHeroCandidates = heroPoolTitles.filter(
            (title) =>
                Array.isArray(title.trailerStreams) &&
                title.trailerStreams.length > 0,
        );
        const traktLogoCandidates = traktHeroCandidates.filter((title) => Boolean(title.logo));
        const traktCandidates = traktLogoCandidates.length > 0
            ? traktLogoCandidates
            : traktHeroCandidates.length > 0
                ? traktHeroCandidates
                : heroPoolTitles;
        if (options.preserveCurrent && includesTitle(traktCandidates, current)) {
            return null;
        }
        const traktSelected = chooseRandom(traktCandidates);
        if (traktSelected) return traktSelected;
    }

    const primaryCandidates = heroPoolTitles.filter(isHeroCandidate);
    if (primaryCandidates.length > 0) {
        if (options.preserveCurrent && includesTitle(primaryCandidates, current)) {
            return null;
        }
        return chooseRandom(primaryCandidates) ?? null;
    }

    const fallbackCandidates = popularTitles.filter(isHeroCandidate);
    if (fallbackCandidates.length > 0) {
        if (options.preserveCurrent && includesTitle(fallbackCandidates, current)) {
            return null;
        }
        return chooseRandom(fallbackCandidates) ?? null;
    }

    const looseCandidates = [...heroPoolTitles, ...popularTitles].filter(
        (title) => Boolean(title.logo)
    );
    if (options.preserveCurrent && includesTitle(looseCandidates, current)) {
        return null;
    }
    return chooseRandom(looseCandidates) ?? null;
}
