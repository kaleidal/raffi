import { writable } from "svelte/store";

const PREVIEW_DELAY_MS = 120;

export const homeAmbient = writable<string | null>(null);

let pending: ReturnType<typeof setTimeout> | undefined;

export function previewAmbient(image: string | null | undefined) {
    clearTimeout(pending);
    if (!image) return;
    pending = setTimeout(() => homeAmbient.set(image), PREVIEW_DELAY_MS);
}
