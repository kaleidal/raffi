import type { ShowResponse } from "../../../lib/library/types/meta_types";

type NowPlaying = {
    title: string;
    artist: string;
    album: string;
    artwork: MediaImage[];
};

type Controls = {
    togglePlay: () => void;
    seekTo: (time: number) => void;
    seekBy: (seconds: number) => void;
    nextEpisode: (() => void) | null;
};

const SKIP_SECONDS = 10;

export function buildNowPlaying(
    metaData: ShowResponse | null,
    season: number | null,
    episode: number | null,
): NowPlaying | null {
    if (!metaData) return null;

    const { meta } = metaData;
    const isEpisode = meta.type === "series" && season != null && episode != null;
    const episodeMeta = isEpisode
        ? meta.videos?.find((video) => video.season === season && video.episode === episode)
        : undefined;
    const images = [episodeMeta?.thumbnail, meta.poster].filter((image) => !!image) as string[];

    return {
        title: isEpisode ? episodeMeta?.name || `Episode ${episode}` : meta.name,
        artist: isEpisode ? meta.name : String(meta.year ?? ""),
        album: isEpisode ? `Season ${season}, Episode ${episode}` : "",
        artwork: images.map((src) => ({ src })),
    };
}

export function setNowPlaying(metaData: ShowResponse | null, season: number | null, episode: number | null) {
    if (!("mediaSession" in navigator)) return;
    const playing = buildNowPlaying(metaData, season, episode);
    navigator.mediaSession.metadata = playing ? new MediaMetadata(playing) : null;
}

export function bindMediaControls({ togglePlay, seekTo, seekBy, nextEpisode }: Controls) {
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    session.setActionHandler("play", togglePlay);
    session.setActionHandler("pause", togglePlay);
    session.setActionHandler("seekto", ({ seekTime }) => {
        if (seekTime != null) seekTo(seekTime);
    });
    session.setActionHandler("seekbackward", ({ seekOffset }) => seekBy(-(seekOffset ?? SKIP_SECONDS)));
    session.setActionHandler("seekforward", ({ seekOffset }) => seekBy(seekOffset ?? SKIP_SECONDS));
    session.setActionHandler("nexttrack", nextEpisode);
}

export function clearMediaSession() {
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    session.metadata = null;
    for (const action of ["play", "pause", "seekto", "seekbackward", "seekforward", "nexttrack"] as const) {
        session.setActionHandler(action, null);
    }
}
