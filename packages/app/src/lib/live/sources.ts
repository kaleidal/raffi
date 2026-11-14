import { get, writable } from "svelte/store";
import { getUserMeta, updateUserSettings } from "../db/db";
import { forgetSource } from "./cache/database";
import type { LiveSource } from "./types";

/** Sources and favourites travel with the account, so a TV picks up what was set up on a computer. */
export type LiveSettings = {
	sources: LiveSource[];
	favourites: string[];
};

const EMPTY: LiveSettings = { sources: [], favourites: [] };

const isSource = (value: any): value is LiveSource =>
	typeof value?.id === "string" &&
	typeof value.name === "string" &&
	((value.kind === "m3u" && typeof value.playlistUrl === "string") ||
		(value.kind === "xtream" && typeof value.serverUrl === "string" && typeof value.username === "string"));

function normalize(value: any): LiveSettings {
	return {
		sources: Array.isArray(value?.sources) ? value.sources.filter(isSource) : [],
		favourites: Array.isArray(value?.favourites)
			? value.favourites.filter((id: unknown): id is string => typeof id === "string")
			: [],
	};
}

export const liveSettings = writable<LiveSettings>(EMPTY);

export async function loadLiveSettings() {
	const meta = await getUserMeta();
	const settings = normalize(meta.settings?.liveTv);
	liveSettings.set(settings);
	return settings;
}

async function save(next: LiveSettings) {
	liveSettings.set(next);
	await updateUserSettings({ liveTv: next });
}

export const newSourceId = () => crypto.randomUUID().slice(0, 8);

export function saveSource(source: LiveSource) {
	const current = get(liveSettings);
	const exists = current.sources.some((entry) => entry.id === source.id);
	return save({
		...current,
		sources: exists
			? current.sources.map((entry) => (entry.id === source.id ? source : entry))
			: [...current.sources, source],
	});
}

export async function removeSource(sourceId: string) {
	const current = get(liveSettings);
	await save({
		sources: current.sources.filter((source) => source.id !== sourceId),
		favourites: current.favourites.filter((id) => !id.startsWith(`${sourceId}:`)),
	});
	await forgetSource(sourceId);
}

export function toggleFavourite(channelId: string) {
	const current = get(liveSettings);
	const favourites = current.favourites.includes(channelId)
		? current.favourites.filter((id) => id !== channelId)
		: [...current.favourites, channelId];
	return save({ ...current, favourites });
}
