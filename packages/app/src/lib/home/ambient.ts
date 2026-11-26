import { writable } from "svelte/store";

const PREVIEW_DELAY_MS = 120;
const RETURN_DELAY_MS = 600;

/** `live` marks a stream of frames from moving video, which blend continuously instead of fading one by one. */
export type Ambient = { image: string | null; live: boolean };

const still = (image: string | null | undefined): Ambient => ({ image: image ?? null, live: false });

export const homeAmbient = writable<Ambient>(still(null));

let resting = still(null);
let previewing = false;
let pending: ReturnType<typeof setTimeout> | undefined;

/** The page's colour when nothing is hovered: the hero's backdrop, or the trailer playing over it. */
export function setRestingAmbient(image: string | null | undefined, live = false) {
    resting = { image: image ?? null, live };
    if (!previewing) homeAmbient.set(resting);
}

export function previewAmbient(image: string | null | undefined) {
    clearTimeout(pending);
    if (!image) return;
    previewing = true;
    pending = setTimeout(() => homeAmbient.set(still(image)), PREVIEW_DELAY_MS);
}

/** Fades back to the hero once the pointer has left the cards for a moment, so moving between cards doesn't flicker. */
export function endAmbientPreview() {
    clearTimeout(pending);
    pending = setTimeout(() => {
        previewing = false;
        homeAmbient.set(resting);
    }, RETURN_DELAY_MS);
}
