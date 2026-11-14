import type { LiveLineup, Programme } from "../types";

const NAME = "raffi-live";
const VERSION = 1;
const LINEUPS = "lineups";
const GUIDES = "guides";

export type GuideRecord = { sourceId: string; guideId: string; programmes: Programme[] };

type Store = typeof LINEUPS | typeof GUIDES;

let opening: Promise<IDBDatabase> | null = null;

function open() {
	opening ??= new Promise((resolve, reject) => {
		const request = indexedDB.open(NAME, VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			db.createObjectStore(LINEUPS, { keyPath: "sourceId" });
			db.createObjectStore(GUIDES, { keyPath: ["sourceId", "guideId"] });
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
	return opening;
}

const done = (transaction: IDBTransaction) =>
	new Promise<void>((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = transaction.onabort = () => reject(transaction.error);
	});

const result = <T>(request: IDBRequest<T>) =>
	new Promise<T>((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});

async function store(name: Store | Store[], mode: IDBTransactionMode) {
	return (await open()).transaction(name, mode);
}

const sourceRange = (sourceId: string) => IDBKeyRange.bound([sourceId], [sourceId, []]);

export async function readLineup(sourceId: string) {
	const transaction = await store(LINEUPS, "readonly");
	return (await result(transaction.objectStore(LINEUPS).get(sourceId))) as LiveLineup | undefined;
}

export async function writeLineup(lineup: LiveLineup) {
	const transaction = await store(LINEUPS, "readwrite");
	transaction.objectStore(LINEUPS).put(lineup);
	await done(transaction);
}

/** Replaces a source's whole guide and records when it was read, in one step. */
export async function writeGuide(lineup: LiveLineup, guides: Map<string, Programme[]>) {
	const transaction = await store([LINEUPS, GUIDES], "readwrite");
	const records = transaction.objectStore(GUIDES);
	records.delete(sourceRange(lineup.sourceId));
	for (const [guideId, programmes] of guides) records.put({ sourceId: lineup.sourceId, guideId, programmes });
	transaction.objectStore(LINEUPS).put(lineup);
	await done(transaction);
}

export async function readGuides(sourceId: string, guideIds: string[]) {
	const transaction = await store(GUIDES, "readonly");
	const records = transaction.objectStore(GUIDES);
	const found = await Promise.all(guideIds.map((guideId) => result(records.get([sourceId, guideId]))));
	return new Map(
		(found as Array<GuideRecord | undefined>).flatMap((record) => (record ? [[record.guideId, record.programmes]] : [])),
	);
}

export async function forgetSource(sourceId: string) {
	const transaction = await store([LINEUPS, GUIDES], "readwrite");
	transaction.objectStore(LINEUPS).delete(sourceId);
	transaction.objectStore(GUIDES).delete(sourceRange(sourceId));
	await done(transaction);
}
