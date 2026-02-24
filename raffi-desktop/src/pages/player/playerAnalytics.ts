export const getPlaybackSourceType = (src: string | null, sess: any) => {
    if (!src) return "unknown";
    if (sess?.isTorrent || src.startsWith("magnet:")) return "torrent";
    if (!src.startsWith("http://") && !src.startsWith("https://")) return "local";
    return "direct";
};

export const getPlaybackAnalyticsProps = ({
    currentVideoSrc,
    sessionData,
    duration,
    currentTime,
    metaData,
    season,
    episode,
    watchPartyActive,
}: {
    currentVideoSrc: string | null;
    sessionData: any;
    duration: number;
    currentTime: number;
    metaData: any;
    season: number | null;
    episode: number | null;
    watchPartyActive: boolean;
}) => {
    const sourceType = getPlaybackSourceType(currentVideoSrc, sessionData);
    const isTorrent = sourceType === "torrent";
    const isLocal = sourceType === "local";
    const progressPercent = duration > 0 ? Math.round((currentTime / duration) * 100) : null;

    return {
        source_type: sourceType,
        is_torrent: isTorrent,
        is_local: isLocal,
        content_type: metaData?.meta?.type ?? null,
        season: season ?? null,
        episode: episode ?? null,
        watch_party: watchPartyActive,
        progress_percent: progressPercent,
        elapsed_seconds: Math.round(currentTime),
    };
};

export const getTrackAnalyticsProps = (detail: any, kind: "audio" | "subtitles") => ({
    kind,
    language: detail?.lang ?? null,
    group: detail?.group ?? null,
    format: detail?.format ?? null,
    is_local: Boolean(detail?.isLocal),
    is_addon: Boolean(detail?.isAddon),
    is_off: detail?.id === "off",
});
