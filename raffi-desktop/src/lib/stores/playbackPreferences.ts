import { writable } from "svelte/store";

const AUTO_SKIP_INTROS_KEY = "raffi_auto_skip_intros";

const readStoredBoolean = (key: string, fallback = false) => {
    try {
        const value = localStorage.getItem(key);
        if (value == null) return fallback;
        return value === "true";
    } catch {
        return fallback;
    }
};

const createBooleanPreference = (key: string, fallback = false) => {
    const store = writable(readStoredBoolean(key, fallback));
    store.subscribe((value) => {
        try {
            localStorage.setItem(key, value ? "true" : "false");
        } catch {
            // ignore persistence errors
        }
    });
    return store;
};

export const autoSkipIntros = createBooleanPreference(AUTO_SKIP_INTROS_KEY, false);