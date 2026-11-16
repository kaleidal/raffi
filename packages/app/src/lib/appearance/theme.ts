import { derived, readable, writable } from "svelte/store";
import { router, type Route } from "../stores/router";

export type ThemePreference = "dark" | "light" | "system";
export type Theme = "dark" | "light";

const STORAGE_KEY = "raffi_theme";
const IMMERSIVE_PAGES = new Set<Route>(["player", "live-player"]);

const storedPreference = (): ThemePreference => {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "system" ? value : "dark";
};

export const themePreference = writable<ThemePreference>(storedPreference());
themePreference.subscribe((value) => localStorage.setItem(STORAGE_KEY, value));

const systemPrefersLight = readable(false, (set) => {
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const update = () => set(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
});

export const theme = derived(
    [themePreference, systemPrefersLight, router],
    ([preference, prefersLight, route]): Theme => {
        if (IMMERSIVE_PAGES.has(route.page)) return "dark";
        if (preference === "system") return prefersLight ? "light" : "dark";
        return preference;
    },
);

export function applyTheme() {
    return theme.subscribe((value) => {
        document.documentElement.dataset.theme = value;
        window.electronAPI?.setTheme?.(value);
    });
}
