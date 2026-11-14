import { matchKey } from "./parse/text";
import { ALL_CHANNELS, FAVOURITES } from "./preferences";
import type { LiveChannel, Programme } from "./types";

export function groupChoices(groups: string[], hasFavourites: boolean) {
	return [...(hasFavourites ? [FAVOURITES] : []), ALL_CHANNELS, ...groups];
}

export function filterChannels(channels: LiveChannel[], group: string, query: string, favourites: Set<string>) {
	const inGroup =
		group === ALL_CHANNELS
			? channels
			: group === FAVOURITES
				? channels.filter((channel) => favourites.has(channel.id))
				: channels.filter((channel) => channel.group === group);
	const needle = matchKey(query);
	if (!needle) return inGroup;
	return inGroup.filter((channel) => matchKey(channel.name).includes(needle) || channel.number === query.trim());
}

/** Index of the programme on air at `time`, found by bisecting the start times. */
export function airingIndex(programmes: Programme[], time: number) {
	let low = 0;
	let high = programmes.length - 1;
	while (low <= high) {
		const middle = (low + high) >> 1;
		if (programmes[middle].start <= time) low = middle + 1;
		else high = middle - 1;
	}
	return high >= 0 && programmes[high].stop > time ? high : -1;
}

export function nowAndNext(programmes: Programme[] | undefined, time: number) {
	if (!programmes?.length) return { now: null, next: null };
	const index = airingIndex(programmes, time);
	if (index >= 0) return { now: programmes[index], next: programmes[index + 1] ?? null };
	return { now: null, next: programmes.find((programme) => programme.start > time) ?? null };
}

/** Programmes overlapping a time window, for one guide row. */
export function programmesBetween(programmes: Programme[] | undefined, from: number, until: number) {
	if (!programmes?.length) return [];
	const first = Math.max(0, airingIndex(programmes, from));
	const visible: Programme[] = [];
	for (let index = first; index < programmes.length && programmes[index].start < until; index += 1) {
		if (programmes[index].stop > from) visible.push(programmes[index]);
	}
	return visible;
}

export const progressThrough = (programme: Programme, time: number) =>
	Math.min(1, Math.max(0, (time - programme.start) / (programme.stop - programme.start)));
