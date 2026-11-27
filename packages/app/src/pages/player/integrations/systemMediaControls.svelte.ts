import { onDestroy } from "svelte";
import type { ShowResponse } from "../../../lib/library/types/meta_types";
import { bindMediaControls, clearMediaSession, setNowPlaying, type MediaControls } from "./mediaSession";

/** Keeps the system media controls showing what is playing and driving this player. */
export function followMediaSession({
    getMediaContext,
    getControls,
}: {
    getMediaContext: () => { metaData: ShowResponse | null; season: number | null; episode: number | null };
    getControls: () => MediaControls;
}) {
    $effect(() => {
        const { metaData, season, episode } = getMediaContext();
        setNowPlaying(metaData, season, episode);
    });
    $effect(() => {
        bindMediaControls(getControls());
    });
    onDestroy(clearMediaSession);
}
