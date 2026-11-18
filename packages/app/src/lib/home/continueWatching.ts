import type { Episode, ShowResponse } from "../library/types/meta_types";
import type { LibraryItem } from "../db/types";
import { updateLibraryPoster } from "../db/db";
import { getCachedMetaData } from "../library/metaCache";
import type { ProgressItem } from "../../pages/meta/types";
import { getSeriesResumeEpisode } from "../../pages/meta/episodeSelection";

export type WatchingItem = ShowResponse & { libraryItem: { progress: unknown; poster?: string } };

export type ResumePoint = {
    episode: { season: number; episode: number };
    detail: string;
    image: string | null;
    progress: number | null;
};

const minutesLeft = (progress: ProgressItem) =>
    `${Math.max(1, Math.round((progress.duration - progress.time) / 60))} min left`;

const isPartlyWatched = (progress: ProgressItem | undefined): progress is ProgressItem =>
    Boolean(progress && !progress.watched && progress.time > 0 && progress.duration > 0);

function lastWatchedKey(progress: Record<string, ProgressItem>) {
    let latest: string | null = null;
    for (const [key, item] of Object.entries(progress)) {
        if (!latest || item.updatedAt > progress[latest].updatedAt) latest = key;
    }
    return latest;
}

function movieResume(item: WatchingItem): ResumePoint {
    const progress = item.libraryItem.progress as ProgressItem | undefined;
    const partly = isPartlyWatched(progress);
    return {
        episode: { season: 0, episode: 0 },
        detail: partly ? minutesLeft(progress) : (item.meta.year ?? ""),
        image: item.meta.background,
        progress: partly ? progress.time / progress.duration : null,
    };
}

function seriesResume(item: WatchingItem): ResumePoint {
    const progress = (item.libraryItem.progress ?? {}) as Record<string, ProgressItem>;
    const key = lastWatchedKey(progress);
    const [season, episode] = (key ?? "1:1").split(":").map(Number);
    const next: Episode | null = getSeriesResumeEpisode(item.meta.videos, { season, episode }, key ? progress[key] : undefined);
    const target = next ?? ({ season, episode } as Episode);
    const targetProgress = progress[`${target.season}:${target.episode}`];
    const partly = isPartlyWatched(targetProgress);
    const code = `S${target.season}E${target.episode}`;

    return {
        episode: { season: target.season, episode: target.episode },
        detail: partly ? `${code} · ${minutesLeft(targetProgress)}` : target.name ? `${code} · ${target.name}` : code,
        image: target.thumbnail || item.meta.background,
        progress: partly ? targetProgress.time / targetProgress.duration : null,
    };
}

export function resumePoint(item: WatchingItem): ResumePoint {
    return item.meta.type === "movie" ? movieResume(item) : seriesResume(item);
}

export type LoadedWatchingItem = ShowResponse & { libraryItem: any };

export async function loadWatchingItem(
    item: LibraryItem,
    previous: LoadedWatchingItem | undefined,
): Promise<LoadedWatchingItem | null> {
    try {
        let meta: ShowResponse;
        if (item.type) {
            meta = await getCachedMetaData(item.imdb_id, item.type, {
                allowStale: true,
            });
        } else {
            try {
                meta = await getCachedMetaData(
                    item.imdb_id,
                    "series",
                    { allowStale: true },
                );
            } catch {
                meta = await getCachedMetaData(
                    item.imdb_id,
                    "movie",
                    { allowStale: true },
                );
            }
        }

        if (meta && meta.meta) {
            if (!item.poster && meta.meta.poster) {
                try {
                    await updateLibraryPoster(
                        item.imdb_id,
                        meta.meta.poster,
                    );
                    item.poster = meta.meta.poster;
                } catch (e) {
                    console.error("Failed to backfill poster", e);
                }
            }

            return {
                ...meta,
                meta: {
                    ...meta.meta,
                    poster: item.poster || meta.meta.poster,
                },
                libraryItem: item,
            };
        } else {
            console.warn("No meta found for:", item.imdb_id);
        }
    } catch (e) {
        console.error(`Failed to load meta for ${item.imdb_id}`, e);

        if (previous) {
            return {
                ...previous,
                meta: {
                    ...previous.meta,
                    poster: item.poster || previous.meta.poster,
                },
                libraryItem: item,
            };
        }

        if (item.poster) {
            return {
                meta: {
                    poster: item.poster,
                    imdb_id: item.imdb_id,
                    type: item.type,
                    name: "",
                    id: item.imdb_id,
                    genres: [],
                    releaseInfo: "",
                    description: "",
                    cast: [],
                    videos: [],
                    popularities: {} as any,
                } as any,
                libraryItem: item,
            };
        }
    }
    return null;
}
