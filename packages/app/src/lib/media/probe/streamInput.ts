import { ALL_FORMATS, Input, UrlSource } from "mediabunny";

const IDLE_RELEASE_MS = 60_000;
const MAX_IDLE_INPUTS = 2;
const CACHE_BYTES = 32 * 1024 * 1024;

type Entry = {
	input: Input;
	references: number;
	idleTimer: ReturnType<typeof setTimeout> | null;
};

export type StreamInput = {
	input: Input;
	release: () => void;
	/** Releases the input and stops sharing it, so a failed read is never reused. */
	discard: () => void;
};

const entries = new Map<string, Entry>();

function disposeEntry(src: string, entry: Entry) {
	if (entry.idleTimer) clearTimeout(entry.idleTimer);
	if (entries.get(src) === entry) entries.delete(src);
	entry.input.dispose();
}

function evictIdleEntries() {
	const idle = [...entries].filter(([, entry]) => entry.references === 0);
	for (const [src, entry] of idle.slice(0, Math.max(0, idle.length - MAX_IDLE_INPUTS))) {
		disposeEntry(src, entry);
	}
}

/**
 * One MediaBunny Input per stream URL, shared by probing, playback, and seeking so
 * container headers and seek indexes are only fetched once and the byte cache is reused.
 */
export function acquireStreamInput(src: string): StreamInput {
	let entry = entries.get(src);
	if (!entry) {
		entry = {
			input: new Input({
				source: new UrlSource(src, { parallelism: 2, maxCacheSize: CACHE_BYTES }),
				formats: ALL_FORMATS,
			}),
			references: 0,
			idleTimer: null,
		};
		entries.set(src, entry);
	}
	const acquired = entry;
	if (acquired.idleTimer) {
		clearTimeout(acquired.idleTimer);
		acquired.idleTimer = null;
	}
	acquired.references += 1;

	let released = false;
	const release = () => {
		if (released) return;
		released = true;
		acquired.references -= 1;
		if (acquired.references > 0) return;
		if (entries.get(src) !== acquired) {
			disposeEntry(src, acquired);
			return;
		}
		acquired.idleTimer = setTimeout(() => disposeEntry(src, acquired), IDLE_RELEASE_MS);
		evictIdleEntries();
	};
	return {
		input: acquired.input,
		release,
		discard: () => {
			if (entries.get(src) === acquired) entries.delete(src);
			release();
		},
	};
}
