/// <reference lib="webworker" />
import { readLineup, writeGuide, writeLineup } from "../cache/database";
import { createPlaylistReader, type ParsedPlaylist } from "../parse/m3u";
import { readJson, readLines, readText } from "../parse/streams";
import { createGuideReader } from "../parse/xmltv";
import { buildXtreamLineup, type Category, type Stream } from "../xtream";
import type { LiveLineup } from "../types";
import type { WorkerJob, WorkerReply } from "./protocol";

const GUIDE_LOOKBACK = 6 * 60 * 60_000;
const GUIDE_LOOKAHEAD = 3 * 24 * 60 * 60_000;

async function saveLineup(sourceId: string, parsed: ParsedPlaylist): Promise<LiveLineup> {
	const previous = await readLineup(sourceId);
	const lineup: LiveLineup = {
		sourceId,
		channels: parsed.channels,
		groups: parsed.groups,
		playlistGuideUrls: parsed.guideUrls,
		refreshedAt: Date.now(),
	};
	if (previous?.guideRefreshedAt) {
		const guideIds = new Map(previous.channels.map((channel) => [channel.id, channel.guideId]));
		for (const channel of lineup.channels) channel.guideId = guideIds.get(channel.id);
		lineup.guideRefreshedAt = previous.guideRefreshedAt;
	}
	await writeLineup(lineup);
	return lineup;
}

type GuideSession = { lineup: LiveLineup; reader: ReturnType<typeof createGuideReader> };

const guideSessions = new Map<string, GuideSession>();

async function startGuide(sourceId: string): Promise<GuideSession> {
	const lineup = await readLineup(sourceId);
	if (!lineup) throw new Error("Load the channels before the guide");
	for (const channel of lineup.channels) channel.guideId = undefined;
	const now = Date.now();
	const session = { lineup, reader: createGuideReader(lineup.channels, { from: now - GUIDE_LOOKBACK, until: now + GUIDE_LOOKAHEAD }) };
	guideSessions.set(sourceId, session);
	return session;
}

/** A guide can span several files; each arrives as its own part and they're written together at the end. */
async function readGuidePart(sourceId: string, body: ReadableStream<Uint8Array>, first: boolean) {
	const session = first ? await startGuide(sourceId) : guideSessions.get(sourceId);
	if (!session) throw new Error("The guide was interrupted");
	if (!first) session.reader.nextDocument();
	await readText(body, session.reader.chunk);
}

async function finishGuide(sourceId: string) {
	const session = guideSessions.get(sourceId);
	guideSessions.delete(sourceId);
	if (!session) throw new Error("The guide was interrupted");
	const guides = session.reader.finish();
	session.lineup.guideRefreshedAt = Date.now();
	await writeGuide(session.lineup, guides);
	return session.lineup;
}

async function run(job: WorkerJob): Promise<LiveLineup | undefined> {
	switch (job.type) {
		case "playlist": {
			const reader = createPlaylistReader(job.sourceId);
			await readLines(job.body, reader.line);
			const parsed = reader.finish();
			if (parsed.channels.length === 0) throw new Error("This playlist has no channels");
			return saveLineup(job.sourceId, parsed);
		}
		case "xtream": {
			const [categories, streams] = await Promise.all([
				readJson<Category[]>(job.categories),
				readJson<Stream[]>(job.streams),
			]);
			return saveLineup(job.source.id, buildXtreamLineup(job.source, job.extension, categories, streams));
		}
		case "guide-part":
			return readGuidePart(job.sourceId, job.body, job.first).then(() => undefined);
		case "guide-finish":
			return finishGuide(job.sourceId);
	}
}

self.onmessage = async ({ data }: MessageEvent<WorkerJob>) => {
	let reply: WorkerReply;
	try {
		reply = { id: data.id, lineup: await run(data) };
	} catch (error) {
		reply = { id: data.id, error: error instanceof Error ? error.message : String(error) };
	}
	self.postMessage(reply);
};
