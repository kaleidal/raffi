export interface ProgressItem {
    time: number;
    duration: number;
    watched: boolean;
    updatedAt: number;
}

export type SeriesProgress = Record<string, ProgressItem>;

export type ProgressMap = SeriesProgress | ProgressItem;
