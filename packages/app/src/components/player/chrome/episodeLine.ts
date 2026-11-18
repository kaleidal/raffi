import type { ShowResponse } from "../../../lib/library/types/meta_types";

export function episodeLine(metaData: ShowResponse | null, season: number | null, episode: number | null) {
    if (metaData?.meta?.type !== "series" || season == null || episode == null) return null;
    const name = metaData.meta.videos?.find(
        (video) => video.season === season && (video.episode === episode || video.number === episode),
    )?.name;
    return [`S${season} · E${episode}`, name].filter(Boolean).join("  ");
}
