import { get } from "svelte/store";
import type { ShowResponse } from "../../../lib/library/types/meta_types";
import { autoSkipIntros } from "../../../lib/stores/playbackPreferences";
import type { Chapter } from "../types";
import * as Chapters from "./chapters";
import * as IntroDb from "./introdb";

/** Startup only waits this long for intro timings; late results still enable skipping. */
const INTRO_DB_STARTUP_BUDGET_MS = 1500;

type PlaybackStartContext = {
    sessionData: any;
    startTime: number;
    metaData: ShowResponse | null;
    season: number | null;
    episode: number | null;
};

export function requestIntroDbChapters(meta: ShowResponse | null, season: number | null, episode: number | null) {
    if (meta?.meta?.type !== "series") return Promise.resolve([] as Chapter[]);
    return IntroDb.fetchIntroDbChapters(meta.meta.imdb_id, season, episode).catch((error) => {
        console.warn("Failed to fetch IntroDB chapters", error);
        return [] as Chapter[];
    });
}

/** Picks where playback begins, skipping a leading intro when its timings arrive within the startup budget. */
export async function resolvePlaybackStart(
    { sessionData, startTime, metaData, season, episode }: PlaybackStartContext,
    onLateChapters: (chapters: Chapter[]) => void,
) {
    const request = requestIntroDbChapters(metaData, season, episode);
    const early = await Promise.race([
        request,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), INTRO_DB_STARTUP_BUDGET_MS)),
    ]);
    if (early === null) void request.then(onLateChapters);
    const introDbChapters = early ?? [];
    const effectiveChapters = Chapters.getEffectiveChapterSegments(sessionData, introDbChapters);
    return {
        effectiveStartTime: Chapters.getStartupSkipTarget(startTime, effectiveChapters, get(autoSkipIntros)),
        introDbChapters,
    };
}
