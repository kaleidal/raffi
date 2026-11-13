import { get, writable } from "svelte/store";
import { readGuides, readLineup } from "./cache/database";
import { guideUrlsFor, refreshGuide, refreshLineup } from "./refresh/refresh";
import type { LiveChannel, LiveLineup, LiveSource, Programme } from "./types";

const LINEUP_STALE_MS = 12 * 60 * 60_000;
const GUIDE_STALE_MS = 6 * 60 * 60_000;

export type LibraryState = {
	source: LiveSource | null;
	lineup: LiveLineup | null;
	loading: boolean;
	error: string | null;
	guideLoading: boolean;
	guideError: string | null;
};

const EMPTY: LibraryState = { source: null, lineup: null, loading: false, error: null, guideLoading: false, guideError: null };

export const library = writable<LibraryState>(EMPTY);

/** The channels in the order they were last shown, which is what channel up and down step through. */
export const zapOrder = writable<LiveChannel[]>([]);

const programmes = new Map<string, Programme[]>();
const requested = new Set<string>();
/** Guide data for the open source, keyed by guide channel, filled in as rows come into view. */
export const guideProgrammes = writable<ReadonlyMap<string, Programme[]>>(programmes);

let openToken = 0;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

function update(token: number, patch: Partial<LibraryState>) {
	if (token === openToken) library.update((state) => ({ ...state, ...patch }));
}

function resetProgrammes() {
	programmes.clear();
	requested.clear();
	guideProgrammes.set(programmes);
}

async function loadGuide(token: number, source: LiveSource, lineup: LiveLineup, force: boolean) {
	const fresh = lineup.guideRefreshedAt && Date.now() - lineup.guideRefreshedAt < GUIDE_STALE_MS;
	if (!guideUrlsFor(source, lineup).length || (fresh && !force)) return;
	update(token, { guideLoading: true, guideError: null });
	try {
		const withGuide = await refreshGuide(source, lineup);
		if (token !== openToken) return;
		resetProgrammes();
		update(token, { lineup: withGuide, guideLoading: false });
	} catch (error) {
		update(token, { guideLoading: false, guideError: message(error) });
	}
}

/** Shows what's cached right away, then refreshes whatever has gone stale in the background. */
export async function openSource(source: LiveSource, { force = false } = {}) {
	const token = ++openToken;
	const sameSource = get(library).source?.id === source.id;
	if (!sameSource) resetProgrammes();
	const cached = sameSource ? get(library).lineup : ((await readLineup(source.id)) ?? null);
	library.set({ ...EMPTY, source, lineup: cached, loading: !cached });

	let lineup = cached;
	if (!lineup || force || Date.now() - lineup.refreshedAt > LINEUP_STALE_MS) {
		update(token, { loading: true, error: null });
		try {
			lineup = await refreshLineup(source);
			update(token, { lineup, loading: false });
		} catch (error) {
			update(token, { loading: false, error: message(error) });
		}
	}
	if (lineup) await loadGuide(token, source, lineup, force);
}

export function closeLibrary() {
	openToken += 1;
	library.set(EMPTY);
	resetProgrammes();
}

let flush: Promise<void> | null = null;

/** Rows ask for their guide as they scroll into view; requests made in the same frame are read together. */
export function requestProgrammes(guideIds: Array<string | undefined>) {
	const sourceId = get(library).source?.id;
	if (!sourceId) return;
	for (const guideId of guideIds) if (guideId) requested.add(guideId);
	flush ??= Promise.resolve().then(async () => {
		flush = null;
		const wanted = [...requested].filter((guideId) => !programmes.has(guideId));
		if (!wanted.length) return;
		for (const guideId of wanted) programmes.set(guideId, []);
		const found = await readGuides(sourceId, wanted);
		if (get(library).source?.id !== sourceId) return;
		for (const [guideId, list] of found) programmes.set(guideId, list);
		guideProgrammes.set(programmes);
	});
}

export async function findChannel(sourceId: string, channelId: string) {
	const state = get(library);
	const lineup = state.source?.id === sourceId && state.lineup ? state.lineup : await readLineup(sourceId);
	return lineup?.channels.find((channel) => channel.id === channelId) ?? null;
}

export async function programmesForChannel(sourceId: string, channel: LiveChannel) {
	if (!channel.guideId) return [];
	if (get(library).source?.id === sourceId && programmes.get(channel.guideId)?.length) return programmes.get(channel.guideId)!;
	return (await readGuides(sourceId, [channel.guideId])).get(channel.guideId) ?? [];
}

/** What the header's search box holds while Live TV is open; it filters channels instead of searching titles. */
export const channelQuery = writable("");
