import { writable } from "svelte/store";

const PREVIEW_DELAY_MS = 120;
const RETURN_DELAY_MS = 600;

export const homeAmbient = writable<string | null>(null);

let resting: string | null = null;
let previewing = false;
let pending: ReturnType<typeof setTimeout> | undefined;

/** The page's colour when nothing is hovered: the hero's backdrop. */
export function setRestingAmbient(image: string | null | undefined) {
    resting = image ?? null;
    if (!previewing) homeAmbient.set(resting);
}

export function previewAmbient(image: string | null | undefined) {
    clearTimeout(pending);
    if (!image) return;
    previewing = true;
    pending = setTimeout(() => homeAmbient.set(image), PREVIEW_DELAY_MS);
}

/** Fades back to the hero once the pointer has left the cards for a moment, so moving between cards doesn't flicker. */
export function endAmbientPreview() {
    clearTimeout(pending);
    pending = setTimeout(() => {
        previewing = false;
        homeAmbient.set(resting);
    }, RETURN_DELAY_MS);
}
