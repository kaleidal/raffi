export const HOME_SEARCH_BAR_POSITION_HEADER = "header";
export const HOME_SEARCH_BAR_POSITION_BOTTOM = "bottom";
export const HOME_SEARCH_BAR_POSITION_AUTO = "auto";

export type HomeSearchBarPosition =
    | typeof HOME_SEARCH_BAR_POSITION_HEADER
    | typeof HOME_SEARCH_BAR_POSITION_BOTTOM
    | typeof HOME_SEARCH_BAR_POSITION_AUTO;

export const HOME_SEARCH_BAR_POSITION_STORAGE_KEY = "raffi:home-search-bar-position";
export const HOME_SEARCH_BAR_POSITION_CHANGED_EVENT = "raffi:home-search-bar-position-changed";
export const HOME_LIVE_TV_SHORTCUT_STORAGE_KEY = "raffi:home-live-tv-shortcut";
export const HOME_LIVE_TV_SHORTCUT_CHANGED_EVENT = "raffi:home-live-tv-shortcut-changed";
const DEFAULT_HOME_SEARCH_BAR_POSITION: HomeSearchBarPosition =
    HOME_SEARCH_BAR_POSITION_AUTO;
const DEFAULT_HOME_LIVE_TV_SHORTCUT_ENABLED = false;

const VALID_POSITIONS = new Set<HomeSearchBarPosition>([
    HOME_SEARCH_BAR_POSITION_HEADER,
    HOME_SEARCH_BAR_POSITION_BOTTOM,
    HOME_SEARCH_BAR_POSITION_AUTO,
]);

export function getStoredHomeSearchBarPosition(): HomeSearchBarPosition {
    if (typeof window === "undefined") return DEFAULT_HOME_SEARCH_BAR_POSITION;
    try {
        const raw = localStorage.getItem(HOME_SEARCH_BAR_POSITION_STORAGE_KEY);
        if (!raw) return DEFAULT_HOME_SEARCH_BAR_POSITION;
        const value = raw.trim() as HomeSearchBarPosition;
        return VALID_POSITIONS.has(value)
            ? value
            : DEFAULT_HOME_SEARCH_BAR_POSITION;
    } catch {
        return DEFAULT_HOME_SEARCH_BAR_POSITION;
    }
}

export function setStoredHomeSearchBarPosition(value: HomeSearchBarPosition) {
    if (typeof window === "undefined") return;
    try {
        if (!VALID_POSITIONS.has(value)) {
            localStorage.removeItem(HOME_SEARCH_BAR_POSITION_STORAGE_KEY);
            return;
        }
        localStorage.setItem(HOME_SEARCH_BAR_POSITION_STORAGE_KEY, value);
    } catch {
        // ignore
    }
}

export function getStoredHomeLiveTvShortcutEnabled(): boolean {
    if (typeof window === "undefined") return DEFAULT_HOME_LIVE_TV_SHORTCUT_ENABLED;
    try {
        const raw = localStorage.getItem(HOME_LIVE_TV_SHORTCUT_STORAGE_KEY);
        return raw === "true";
    } catch {
        return DEFAULT_HOME_LIVE_TV_SHORTCUT_ENABLED;
    }
}

export function setStoredHomeLiveTvShortcutEnabled(enabled: boolean) {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(HOME_LIVE_TV_SHORTCUT_STORAGE_KEY, enabled.toString());
    } catch {
        // ignore
    }
}
