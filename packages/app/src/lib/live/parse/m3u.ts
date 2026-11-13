import type { LiveChannel, StreamHeaders } from "../types";
import { quotedAttributes } from "./text";

export const UNGROUPED = "Other";

type Entry = {
	attributes: Record<string, string>;
	title: string;
	group?: string;
	headers: StreamHeaders;
};

export type ParsedPlaylist = {
	channels: LiveChannel[];
	groups: string[];
	guideUrls?: string[];
};

/** Guide fields often list several addresses separated by commas. */
export const splitGuideUrls = (value: string | undefined) =>
	(value ?? "")
		.split(",")
		.map((url) => url.trim())
		.filter((url) => /^https?:\/\//i.test(url));

/** A short, stable id from the stream address, so favourites survive the playlist being reordered. */
function streamKey(url: string) {
	let hash = 0x811c9dc5;
	for (let index = 0; index < url.length; index += 1) {
		hash ^= url.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(36);
}

/** The comma that ends the attributes, skipping any inside quoted values. */
function titleComma(line: string) {
	let quote = "";
	for (let index = 0; index < line.length; index += 1) {
		const char = line[index];
		if (quote) {
			if (char === quote) quote = "";
		} else if (char === '"' || char === "'") {
			quote = char;
		} else if (char === ",") {
			return index;
		}
	}
	return -1;
}

function readExtinf(line: string): Entry {
	const comma = titleComma(line);
	return {
		attributes: quotedAttributes(comma >= 0 ? line.slice(0, comma) : line),
		title: comma >= 0 ? line.slice(comma + 1).trim() : "",
		headers: {},
	};
}

function readOption(line: string, headers: StreamHeaders) {
	const separator = line.indexOf("=");
	if (separator < 0) return;
	const key = line.slice(line.indexOf(":") + 1, separator).trim().toLowerCase();
	const value = line.slice(separator + 1).trim();
	if (!value) return;
	if (key === "http-user-agent") headers.userAgent = value;
	else if (key === "http-referrer" || key === "http-referer") headers.referrer = value;
}

const firstOf = (attributes: Record<string, string>, ...keys: string[]) => {
	for (const key of keys) {
		if (attributes[key]) return attributes[key];
	}
	return undefined;
};

/**
 * Reads an extended M3U playlist one line at a time, so a large one never has to be held whole.
 * Feed it lines with `line`, then call `finish`.
 */
export function createPlaylistReader(sourceId: string) {
	const channels: LiveChannel[] = [];
	const groupOrder = new Map<string, true>();
	const seen = new Map<string, number>();
	let guideUrls: string[] = [];
	let entry: Entry | null = null;

	function addChannel(url: string, current: Entry) {
		const { attributes } = current;
		const group = attributes["group-title"] || current.group || UNGROUPED;
		groupOrder.set(group, true);
		const hasHeaders = current.headers.userAgent || current.headers.referrer;
		const key = streamKey(url);
		const repeat = seen.get(key) ?? 0;
		seen.set(key, repeat + 1);
		channels.push({
			id: `${sourceId}:${key}${repeat ? `~${repeat}` : ""}`,
			name: current.title || attributes["tvg-name"] || attributes["tvg-id"] || url,
			url,
			group,
			logo: attributes["tvg-logo"] || undefined,
			number: firstOf(attributes, "tvg-chno", "channel-number", "tvg-num"),
			tvgId: attributes["tvg-id"] || undefined,
			tvgName: attributes["tvg-name"] || undefined,
			headers: hasHeaders ? current.headers : undefined,
		});
	}

	return {
		line(raw: string) {
			const line = raw.trim();
			if (!line) return;
			if (line.startsWith("#EXTM3U")) {
				const attributes = quotedAttributes(line);
				guideUrls = splitGuideUrls(firstOf(attributes, "url-tvg", "x-tvg-url"));
			} else if (line.startsWith("#EXTINF")) {
				entry = readExtinf(line);
			} else if (!entry) {
				return;
			} else if (line.startsWith("#EXTGRP:")) {
				entry.group = line.slice(8).trim() || undefined;
			} else if (line.startsWith("#EXTVLCOPT:")) {
				readOption(line, entry.headers);
			} else if (!line.startsWith("#")) {
				addChannel(line, entry);
				entry = null;
			}
		},
		finish(): ParsedPlaylist {
			return { channels, groups: [...groupOrder.keys()], guideUrls };
		},
	};
}
