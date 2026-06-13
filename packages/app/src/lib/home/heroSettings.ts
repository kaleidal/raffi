export const HOME_HERO_SOURCE_CINEMETA = "cinemeta";
export const HOME_HERO_SOURCE_TRAKT_RECOMMENDATIONS = "trakt_recommendations";
export const HOME_HERO_SOURCE_STORAGE_KEY = "raffi:home-hero-source";

export function getStoredHomeHeroSource(): string {
    if (typeof window === "undefined") return HOME_HERO_SOURCE_CINEMETA;
    try {
        const raw = localStorage.getItem(HOME_HERO_SOURCE_STORAGE_KEY);
        if (!raw || raw.trim().length === 0) return HOME_HERO_SOURCE_CINEMETA;
        return raw;
    } catch {
        return HOME_HERO_SOURCE_CINEMETA;
    }
}

export function setStoredHomeHeroSource(value: string) {
    if (typeof window === "undefined") return;
    try {
        if (!value || value.trim().length === 0) {
            localStorage.removeItem(HOME_HERO_SOURCE_STORAGE_KEY);
            return;
        }
        localStorage.setItem(HOME_HERO_SOURCE_STORAGE_KEY, value);
    } catch {
        // ignore
    }
}
