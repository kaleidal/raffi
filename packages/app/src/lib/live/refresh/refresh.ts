import { isWeb } from "../../shell/platform";
import { describeStatus, proxyUrl } from "../network/proxy";
import { checkXtreamAccount, xtreamApiUrl, xtreamGuideUrl } from "../xtream";
import { splitGuideUrls } from "../parse/m3u";
import type { LiveLineup, LiveSource } from "../types";
import type { WorkerJob, WorkerReply } from "./protocol";

type Job = WorkerJob extends infer J ? (J extends { id: number } ? Omit<J, "id"> : never) : never;

let worker: Worker | null = null;
let nextJob = 0;
const waiting = new Map<number, { resolve: (lineup: LiveLineup | undefined) => void; reject: (error: Error) => void }>();

function startWorker() {
	worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
	worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
		const job = waiting.get(data.id);
		waiting.delete(data.id);
		if ("error" in data) job?.reject(new Error(data.error));
		else job?.resolve(data.lineup);
	};
	return worker;
}

function runJob(job: Job, bodies: ReadableStream[]) {
	const id = nextJob++;
	return new Promise<LiveLineup | undefined>((resolve, reject) => {
		waiting.set(id, { resolve, reject });
		(worker ?? startWorker()).postMessage({ ...job, id }, bodies);
	});
}

const hostOf = (url: string) => new URL(url).host;

async function download(url: string) {
	let response: Response;
	try {
		response = await fetch(proxyUrl(url));
	} catch {
		throw new Error(
			isWeb
				? `${hostOf(url)} doesn't let browsers connect. The desktop and Android apps can.`
				: `Couldn't reach ${hostOf(url)}`,
		);
	}
	if (!response.ok || !response.body) {
		void response.body?.cancel();
		throw new Error(describeStatus(response.status, hostOf(url)));
	}
	return response.body;
}

const fetchJson = async <T>(url: string): Promise<T> => new Response(await download(url)).json();

async function loadLineup(source: LiveSource): Promise<LiveLineup> {
	if (source.kind === "m3u") {
		const body = await download(source.playlistUrl);
		return (await runJob({ type: "playlist", sourceId: source.id, body }, [body]))!;
	}
	const extension = await checkXtreamAccount(source, fetchJson);
	const [categories, streams] = await Promise.all([
		download(xtreamApiUrl(source, "get_live_categories")),
		download(xtreamApiUrl(source, "get_live_streams")),
	]);
	return (await runJob({ type: "xtream", source, extension, categories, streams }, [categories, streams]))!;
}

export function guideUrlsFor(source: LiveSource, lineup: LiveLineup | undefined) {
	if (source.kind === "xtream") return [xtreamGuideUrl(source)];
	const own = splitGuideUrls(source.guideUrl);
	return own.length ? own : (lineup?.playlistGuideUrls ?? []);
}

/** Reads each guide in turn, so only one download is open at a time; one that fails doesn't stop the rest. */
async function loadGuide(source: LiveSource, lineup: LiveLineup): Promise<LiveLineup> {
	const urls = guideUrlsFor(source, lineup);
	if (!urls.length) return lineup;
	let started = false;
	let firstFailure: unknown = null;
	for (const url of urls) {
		try {
			const body = await download(url);
			await runJob({ type: "guide-part", sourceId: source.id, body, first: !started }, [body]);
			started = true;
		} catch (error) {
			firstFailure ??= error;
		}
	}
	if (!started) throw firstFailure;
	return (await runJob({ type: "guide-finish", sourceId: source.id }, []))!;
}

const inFlight = new Map<string, Promise<LiveLineup>>();

function once(key: string, start: () => Promise<LiveLineup>) {
	const running = inFlight.get(key);
	if (running) return running;
	const promise = start().finally(() => inFlight.delete(key));
	inFlight.set(key, promise);
	return promise;
}

export const refreshLineup = (source: LiveSource) => once(`lineup:${source.id}`, () => loadLineup(source));

export const refreshGuide = (source: LiveSource, lineup: LiveLineup) =>
	once(`guide:${source.id}`, () => loadGuide(source, lineup));
