import { writable } from "svelte/store";

/** True while native video plays under the page, which then has to stay see-through. */
export const nativeVideoVisible = writable(false);
