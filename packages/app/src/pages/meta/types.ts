import type { Episode } from "../../lib/library/types/meta_types";

export interface LastWatched {
    season: number;
    episode: number;
}

export type EpisodeRef = Pick<Episode, "season" | "episode">;
