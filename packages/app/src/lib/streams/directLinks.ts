import type { ShowResponse } from "../library/types/meta_types";
import type { DirectSourceConfig } from "./sourceSettings";
import type { Stream } from "../../pages/meta/types";

type DirectStreamContext = {
    metaData: ShowResponse;
    imdbId: string;
    episode: any;
    progressSeconds: number;
};

const padNumber = (value: number | string | null | undefined) => {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric)) return "00";
    return String(Math.max(0, Math.trunc(numeric))).padStart(2, "0");
};

const cleanProgress = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return "0";
    return String(Math.floor(value));
};

const getTmdbId = (metaData: ShowResponse) => {
    const direct = metaData.meta?.moviedb_id;
    if (typeof direct === "number" && Number.isFinite(direct) && direct > 0) {
        return String(Math.trunc(direct));
    }

    const id = String(metaData.meta?.id || "");
    return /^\d+$/.test(id) ? id : "";
};

const replaceToken = (template: string, token: string, value: string) =>
    template.replaceAll(`[${token}]`, encodeURIComponent(value));

export const buildDirectLinkUrl = (
    template: string,
    config: DirectSourceConfig,
    context: DirectStreamContext,
) => {
    const tmdbId = getTmdbId(context.metaData);
    const imdbId = String(context.metaData.meta?.imdb_id || context.imdbId || "").trim();
    const selectedId = config.idType === "imdb" ? imdbId : (tmdbId || imdbId);
    const season = String(context.episode?.season ?? 0);
    const episode = String(context.episode?.episode ?? context.episode?.number ?? 0);

    return [
        ["id", selectedId],
        ["imdb_id", imdbId],
        ["tmdb_id", tmdbId],
        ["season", season],
        ["episode", episode],
        ["season_padded", padNumber(season)],
        ["episode_padded", padNumber(episode)],
        ["progress", cleanProgress(context.progressSeconds)],
        ["type", context.metaData.meta?.type === "series" ? "series" : "movie"],
    ].reduce((url, [token, value]) => replaceToken(url, token, value), template.trim());
};

export const createDirectStream = (
    config: DirectSourceConfig,
    context: DirectStreamContext,
): Stream | null => {
    const isSeries = context.metaData.meta?.type === "series";
    const template = isSeries ? config.seriesUrl : config.movieUrl;
    if (!template) return null;

    const url = buildDirectLinkUrl(template, config, context);
    if (!/^https?:\/\//i.test(url)) return null;

    const sourceName = config.displayName || "Direct link";
    const formatLabel = config.playbackMode === "player" && config.playerFormat !== "auto"
        ? ` • ${config.playerFormat.toUpperCase()}`
        : "";

    return {
        name: sourceName,
        title: `${sourceName}${formatLabel}`,
        url,
        raffiSource: "direct",
        directPlaybackMode: config.playbackMode,
        directPlayerFormat: config.playerFormat,
    };
};
