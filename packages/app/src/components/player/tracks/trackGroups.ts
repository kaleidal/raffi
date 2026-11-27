import { languageName, preferredLanguage } from "../../../lib/utils/languages";
import type { Track } from "../../../pages/player/types";

export type SubtitleLanguage = { name: string; tracks: Track[] };

export const isOff = (track: Track) => String(track.id) === "off";

export const trackLanguage = (track: Track) => languageName(track.lang) ?? "Unknown";

/** Subtitles grouped by language, the viewer's own language first and the rest by name; files they added stay apart. */
export function subtitleLanguages(tracks: Track[]): SubtitleLanguage[] {
    const groups = new Map<string, SubtitleLanguage>();
    for (const track of tracks) {
        if (isOff(track) || track.isLocal) continue;
        const name = trackLanguage(track);
        const group = groups.get(name) ?? { name, tracks: [] };
        group.tracks.push(track);
        groups.set(name, group);
    }
    const own = languageName(preferredLanguage());
    const rank = (group: SubtitleLanguage) => (group.name === own ? 0 : 1);
    return [...groups.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** Numbers variants that share a name, so four tracks from one addon read apart. */
export function variantLabel(track: Track, siblings: Track[]) {
    const namesakes = siblings.filter((sibling) => sibling.label === track.label);
    return namesakes.length > 1 ? `${track.label} ${namesakes.indexOf(track) + 1}` : track.label;
}
