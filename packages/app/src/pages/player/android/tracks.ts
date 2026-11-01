import type { Track } from "../types";
import type { NativeTracks, SubtitleChoice } from "./nativePlayback";

export function audioTrackOptions(tracks: NativeTracks): Track[] {
	return tracks.audio.map(({ id, label, lang, selected }) => ({ id, label, lang, selected, group: "Audio" }));
}

/** Addon subtitles are side-loaded on demand, so the page owns which one is picked. */
export function subtitleTrackOptions(
	tracks: NativeTracks,
	addonSubtitles: Track[],
	selectedAddonId: Track["id"] | null,
): Track[] {
	const embedded = tracks.subtitles
		.filter((track) => !track.addon)
		.map(({ id, label, lang, selected }) => ({
			id,
			label,
			lang,
			selected: selectedAddonId === null && selected,
			group: "Embedded",
			isEmbedded: true,
		}));
	const addon = addonSubtitles.map((track) => ({ ...track, selected: track.id === selectedAddonId }));
	const anySelected = embedded.some((track) => track.selected) || addon.some((track) => track.selected);
	return [{ id: "off", label: "Off", selected: !anySelected, group: "None" }, ...embedded, ...addon];
}

export function subtitleChoice(track: Track): SubtitleChoice {
	if (String(track.id) === "off") return { kind: "off" };
	if (track.isAddon && track.url) {
		return { kind: "addon", url: track.url, lang: track.lang ?? "", label: track.label };
	}
	return { kind: "embedded", id: String(track.id) };
}

export const selectedLabel = (tracks: Track[], fallback: string) =>
	tracks.find((track) => track.selected)?.label ?? fallback;
