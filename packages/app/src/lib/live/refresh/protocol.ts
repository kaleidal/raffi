import type { LiveLineup, XtreamSource } from "../types";

type Body = ReadableStream<Uint8Array>;

export type WorkerJob = { id: number } & (
	| { type: "playlist"; sourceId: string; body: Body }
	| { type: "xtream"; source: XtreamSource; extension: string; categories: Body; streams: Body }
	| { type: "guide-part"; sourceId: string; body: Body; first: boolean }
	| { type: "guide-finish"; sourceId: string }
);

export type WorkerReply = { id: number } & ({ lineup?: LiveLineup } | { error: string });
