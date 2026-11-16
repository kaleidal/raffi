import { writable } from "svelte/store";

export type SettingsSection =
    | "account"
    | "appearance"
    | "playback"
    | "streaming"
    | "addons"
    | "live"
    | "library"
    | "about";

export type AddonResourceFilter = "all" | "stream" | "subtitles" | "catalog" | "meta";

export type SettingsView = {
    section: SettingsSection;
    addonFilter: AddonResourceFilter;
};

export const settingsView = writable<SettingsView | null>(null);

export function openSettings(section: SettingsSection = "account", addonFilter: AddonResourceFilter = "all") {
    settingsView.set({ section, addonFilter });
}

export function closeSettings() {
    settingsView.set(null);
}
