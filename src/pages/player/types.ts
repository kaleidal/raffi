// Type definitions for the Player component

export interface Chapter {
    startTime: number;
    endTime: number;
    title: string;
}

export interface Track {
    id: string | number;
    label: string;
    selected: boolean;
    group: string;
    lang?: string;
    url?: string;
    isAddon?: boolean;
}

export interface SessionData {
    durationSeconds: number;
    chapters?: Chapter[];
    availableStreams?: any[];
    audioIndex?: number;
}

export interface SeekFeedback {
    type: "forward" | "backward";
    id: number;
}

export interface ParsedCue {
    start: number;
    end: number;
    text: string;
}
