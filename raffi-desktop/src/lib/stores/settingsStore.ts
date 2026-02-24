import { writable } from "svelte/store";

const storedZoom = localStorage.getItem("user_zoom");
export const userZoom = writable<number>(storedZoom ? parseFloat(storedZoom) : 1);

userZoom.subscribe((value) => {
    localStorage.setItem("user_zoom", value.toString());
});
