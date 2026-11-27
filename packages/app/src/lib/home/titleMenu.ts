import { writable } from "svelte/store";
import type { PopularTitleMeta } from "../library/types/popular_types";
import { getPrimaryTrailerId } from "./trailers";

export type TitleMenuTarget = {
    x: number;
    y: number;
    imdbId: string;
    type: string;
    trailerId: string;
};

export const titleMenu = writable<TitleMenuTarget | null>(null);

export function openTitleMenu(event: MouseEvent, title: PopularTitleMeta) {
    event.preventDefault();
    titleMenu.set({
        x: event.clientX,
        y: event.clientY,
        imdbId: title.imdb_id,
        type: title.type,
        trailerId: getPrimaryTrailerId(title) ?? "",
    });
}
