import type { LiveChannel, Programme } from "../types";
import { channelKey, elementText, quotedAttributes } from "./text";

const DESCRIPTION_LIMIT = 480;

/** "20260115183000 +0100", with seconds and offset both optional; times without an offset are UTC. */
export function parseGuideTime(value: string | undefined) {
	const match = value?.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*(?:([+-])(\d{2}):?(\d{2}))?/);
	if (!match) return null;
	const [, year, month, day, hour, minute, second = "0", sign, offsetHours, offsetMinutes] = match;
	const utc = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
	if (!sign) return utc;
	const offset = (+offsetHours * 60 + +offsetMinutes) * 60_000;
	return sign === "+" ? utc - offset : utc + offset;
}

const firstElement = (inner: string, tag: string) => {
	const match = inner.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`));
	return match ? elementText(match[1]) || undefined : undefined;
};

const allElements = (inner: string, tag: string) =>
	[...inner.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "g"))].map((match) => elementText(match[1]));

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
	const list = map.get(key);
	if (list) list.push(value);
	else map.set(key, [value]);
}

type Block = "channel" | "programme";

const BLOCKS: Block[] = ["channel", "programme"];

/** The block opening at `index`, null when it's some other tag, undefined when the text ends too soon to tell. */
function blockAt(text: string, index: number): Block | null | undefined {
	let undecided = false;
	for (const name of BLOCKS) {
		const tag = `<${name}`;
		const end = index + tag.length;
		if (text.length <= end) {
			undecided ||= tag.startsWith(text.slice(index));
			continue;
		}
		if (text.startsWith(tag, index) && /[\s>/]/.test(text[end])) return name;
	}
	return undecided ? undefined : null;
}

export type GuideWindow = { from: number; until: number };

/**
 * Reads XMLTV guides as they download and keeps only what the playlist can show:
 * programmes for channels it carries, inside the given window.
 * Feed it text with `chunk`, call `nextDocument` between guides, then `finish`.
 * When several guides cover the same channel, the first one to do so wins.
 */
export function createGuideReader(channels: LiveChannel[], window: GuideWindow) {
	const byTvgId = new Map<string, LiveChannel[]>();
	const byIdKey = new Map<string, LiveChannel[]>();
	const byName = new Map<string, LiveChannel[]>();
	for (const channel of channels) {
		if (channel.tvgId) {
			push(byTvgId, channel.tvgId.toLowerCase(), channel);
			push(byIdKey, channelKey(channel.tvgId), channel);
		}
		const names = new Set([channelKey(channel.tvgName), channelKey(channel.name)]);
		for (const name of names) if (name) push(byName, name, channel);
	}

	const unmatched = (matches: LiveChannel[] | undefined) => matches?.filter((channel) => !channel.guideId);

	const wanted = new Set<string>();
	const programmes = new Map<string, Programme[]>();
	const coveredBy = new Map<string, number>();
	let document = 0;
	let buffer = "";
	let sawGuide = false;

	function claim(guideId: string, matches: LiveChannel[] | undefined) {
		if (!matches?.length) return;
		for (const channel of matches) channel.guideId ??= guideId;
		wanted.add(guideId);
	}

	function readChannel(block: string) {
		const id = quotedAttributes(block.slice(0, block.indexOf(">"))).id;
		if (!id) return;
		claim(id, byTvgId.get(id.toLowerCase()));
		claim(id, unmatched(byIdKey.get(channelKey(id))));
		for (const name of allElements(block, "display-name")) claim(id, unmatched(byName.get(channelKey(name))));
	}

	function readProgramme(block: string) {
		const openEnd = block.indexOf(">");
		const attributes = quotedAttributes(block.slice(0, openEnd));
		const guideId = attributes.channel;
		if (!guideId) return;
		if (!wanted.has(guideId)) {
			const matches = byTvgId.get(guideId.toLowerCase()) ?? unmatched(byIdKey.get(channelKey(guideId)));
			if (!matches?.length) return;
			claim(guideId, matches);
		}
		const owner = coveredBy.get(guideId) ?? document;
		if (owner !== document) return;
		const start = parseGuideTime(attributes.start);
		const stop = parseGuideTime(attributes.stop);
		if (start === null || stop === null || stop <= window.from || start >= window.until) return;
		coveredBy.set(guideId, document);
		const inner = block.slice(openEnd + 1);
		push(programmes, guideId, {
			start,
			stop,
			title: firstElement(inner, "title") ?? "",
			subtitle: firstElement(inner, "sub-title"),
			description: firstElement(inner, "desc")?.slice(0, DESCRIPTION_LIMIT),
		});
	}

	function drain() {
		let cursor = 0;
		while (true) {
			const open = buffer.indexOf("<", cursor);
			if (open < 0) {
				cursor = buffer.length;
				break;
			}
			const block = blockAt(buffer, open);
			if (block === undefined) {
				cursor = open;
				break;
			}
			if (block === null) {
				sawGuide ||= buffer.startsWith("<tv", open);
				cursor = open + 1;
				continue;
			}
			const openEnd = buffer.indexOf(">", open);
			if (openEnd < 0) {
				cursor = open;
				break;
			}
			if (buffer[openEnd - 1] === "/") {
				if (block === "channel") readChannel(buffer.slice(open, openEnd + 1));
				cursor = openEnd + 1;
				continue;
			}
			const closing = `</${block}>`;
			const close = buffer.indexOf(closing, openEnd);
			if (close < 0) {
				cursor = open;
				break;
			}
			const text = buffer.slice(open, close);
			if (block === "channel") readChannel(text);
			else readProgramme(text);
			cursor = close + closing.length;
		}
		buffer = buffer.slice(cursor);
	}

	return {
		chunk(text: string) {
			buffer += text;
			drain();
		},
		nextDocument() {
			buffer = "";
			document += 1;
		},
		finish() {
			if (!sawGuide) throw new Error("This doesn't look like an XMLTV guide");
			for (const list of programmes.values()) list.sort((a, b) => a.start - b.start);
			return programmes;
		},
	};
}
