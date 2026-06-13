import { getUserMeta, updateUserSettings } from "../db/db";

export const STREAMING_SOURCE_SETTINGS_CHANGED_EVENT = "raffi:streaming-source-settings-changed";

export type StreamingSourceMode = "addons" | "direct";
export type DirectPlaybackMode = "iframe" | "player";
export type DirectPlayerFormat = "auto" | "hls" | "mp4" | "webm" | "dash" | "other";
export type DirectIdType = "tmdb" | "imdb";

export interface DirectSourceConfig {
    displayName: string;
    movieUrl: string;
    seriesUrl: string;
    idType: DirectIdType;
    playbackMode: DirectPlaybackMode;
    playerFormat: DirectPlayerFormat;
}

export interface StreamingSourceSettings {
    mode: StreamingSourceMode;
    direct: DirectSourceConfig;
}

export const DIRECT_SOURCE_DEFAULTS: StreamingSourceSettings = {
    mode: "addons",
    direct: {
        displayName: "Direct link",
        movieUrl: "",
        seriesUrl: "",
        idType: "tmdb",
        playbackMode: "iframe",
        playerFormat: "auto",
    },
};

const normalizeMode = (value: any): StreamingSourceMode =>
    value === "direct" ? "direct" : "addons";

const normalizePlaybackMode = (value: any): DirectPlaybackMode =>
    value === "player" ? "player" : "iframe";

const normalizePlayerFormat = (value: any): DirectPlayerFormat => {
    if (value === "hls" || value === "mp4" || value === "webm" || value === "dash" || value === "other") {
        return value;
    }
    return "auto";
};

const normalizeIdType = (value: any): DirectIdType =>
    value === "imdb" ? "imdb" : "tmdb";

export const normalizeStreamingSourceSettings = (value: any): StreamingSourceSettings => {
    const direct = value?.direct || {};
    return {
        mode: normalizeMode(value?.mode),
        direct: {
            displayName: String(direct.displayName || DIRECT_SOURCE_DEFAULTS.direct.displayName).trim() || DIRECT_SOURCE_DEFAULTS.direct.displayName,
            movieUrl: String(direct.movieUrl || "").trim(),
            seriesUrl: String(direct.seriesUrl || "").trim(),
            idType: normalizeIdType(direct.idType),
            playbackMode: normalizePlaybackMode(direct.playbackMode),
            playerFormat: normalizePlayerFormat(direct.playerFormat),
        },
    };
};

export const getStreamingSourceSettings = async (): Promise<StreamingSourceSettings> => {
    const meta = await getUserMeta();
    return normalizeStreamingSourceSettings(meta.settings?.streamingSource);
};

export const saveStreamingSourceSettings = async (
    settings: StreamingSourceSettings,
): Promise<StreamingSourceSettings> => {
    const normalized = normalizeStreamingSourceSettings(settings);
    await updateUserSettings({ streamingSource: normalized });
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(STREAMING_SOURCE_SETTINGS_CHANGED_EVENT, {
            detail: normalized,
        }));
    }
    return normalized;
};
