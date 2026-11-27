import { languageCode } from "../../../lib/utils/languages";

type SubtitlePreference = { enabled: boolean; lang: string | null };
type SubtitleOption = { id: string | number; lang?: string | null; selected?: boolean };

const PREFERENCE_KEY = "player_subtitles";

const codeOf = (lang: string | null | undefined) => languageCode(lang?.split(/[-_]/)[0]);

export function readSubtitlePreference(): SubtitlePreference | null {
    const stored = localStorage.getItem(PREFERENCE_KEY);
    return stored ? JSON.parse(stored) : null;
}

/** Keeps the viewer's last subtitle choice, so the next episode starts the same way. */
export function rememberSubtitleChoice(track: SubtitleOption) {
    const enabled = String(track.id) !== "off";
    const lang = (enabled && codeOf(track.lang)) || readSubtitlePreference()?.lang || null;
    localStorage.setItem(PREFERENCE_KEY, JSON.stringify({ enabled, lang }));
}

export function findSubtitleInLanguage<T extends SubtitleOption>(tracks: T[], lang: string | null | undefined) {
    const code = codeOf(lang);
    return code ? tracks.find((track) => String(track.id) !== "off" && codeOf(track.lang) === code) : undefined;
}
