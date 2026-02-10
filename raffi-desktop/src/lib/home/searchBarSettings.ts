export const HOME_SEARCH_BAR_POSITION_HEADER = "header";
export const HOME_SEARCH_BAR_POSITION_BOTTOM = "bottom";
export const HOME_SEARCH_BAR_POSITION_AUTO = "auto";

export type HomeSearchBarPosition =
    | typeof HOME_SEARCH_BAR_POSITION_HEADER
    | typeof HOME_SEARCH_BAR_POSITION_BOTTOM
    | typeof HOME_SEARCH_BAR_POSITION_AUTO;

export const HOME_SEARCH_BAR_POSITION_STORAGE_KEY = "raffi:home-search-bar-position";
export const HOME_SEARCH_BAR_POSITION_CHANGED_EVENT = "raffi:home-search-bar-position-changed";
const DEFAULT_HOME_SEARCH_BAR_POSITION: HomeSearchBarPosition =
    HOME_SEARCH_BAR_POSITION_AUTO;

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
