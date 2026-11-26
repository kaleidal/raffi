import type { Track } from "../../../pages/player/types";

export const TRACK_PANEL_ID = "track-panel";

export type SubtitleTools = {
    delay: number;
    onDelayChange: (seconds: number) => void;
    onUpload: (file: File) => Promise<void>;
};

export type TrackOptions = {
    audio: Track[];
    subtitles: Track[];
    onSelectAudio: (track: Track) => void;
    onSelectSubtitle: (track: Track) => void;
    /** Delay and your own subtitle files, where the player supports them. */
    subtitleTools?: SubtitleTools;
};
