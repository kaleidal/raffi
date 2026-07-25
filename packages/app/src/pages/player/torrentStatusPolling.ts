import { get } from "svelte/store";
import { getLimboTorrent, type LimboTorrentStatus } from "../../lib/limbo/client";
import { loading, loadingDetails, loadingProgress, loadingStage } from "./playerState";

function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB"];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	const digits = value >= 10 || unit === 0 ? 0 : 1;
	return `${value.toFixed(digits)} ${units[unit]}`;
}

function formatSpeed(bytesPerSec: number): string {
	if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return "0 B/s";
	return `${formatBytes(bytesPerSec)}/s`;
}

function limboStatusCopy(data: LimboTorrentStatus): {
	stage: string;
	details: string;
	progress: number | null;
} {
	const peers = typeof data.peers === "number" ? data.peers : 0;
	const progress = typeof data.progress === "number" ? data.progress : null;
	const speed =
		typeof data.downloadSpeed === "number" ? data.downloadSpeed : 0;
	const buffered =
		typeof data.contiguousBytes === "number" ? data.contiguousBytes : 0;
	const stage = String(data.stage || "");

	if (stage === "metadata") {
		if (peers <= 0) {
			return {
				stage: "Looking for peers",
				details: "Waiting on trackers and DHT for torrent metadata",
				progress: null,
			};
		}
		return {
			stage: "Fetching torrent metadata",
			details: `${peers} peer${peers === 1 ? "" : "s"} connected`,
			progress: null,
		};
	}

	if (stage === "downloading") {
		if (peers <= 0 && speed <= 0) {
			return {
				stage: "Waiting for peers",
				details:
					"No peers yet — if this stalls, check VPN or try another source",
				progress: progress,
			};
		}
		const parts: string[] = [];
		parts.push(`${peers} peer${peers === 1 ? "" : "s"}`);
		if (speed > 0) parts.push(formatSpeed(speed));
		if (buffered > 0) parts.push(`${formatBytes(buffered)} ready`);
		return {
			stage: "Buffering torrent",
			details: parts.join(" · "),
			progress,
		};
	}

	if (stage === "ready" || stage === "done" || data.ready) {
		return {
			stage: "Starting stream",
			details: peers > 0 ? `${peers} peer${peers === 1 ? "" : "s"}` : "",
			progress: null,
		};
	}

	return {
		stage: "Preparing torrent",
		details: peers > 0 ? `${peers} peer${peers === 1 ? "" : "s"}` : "",
		progress: null,
	};
}

export const createTorrentStatusPoller = ({
	onTorrentError,
}: {
	onTorrentError?: (message: string) => void;
}) => {
	let intervalRef: ReturnType<typeof setInterval> | null = null;
	let torrentId: string | null = null;
	let fatalHandled = false;
	let readyPromise: Promise<void> | null = null;
	let resolveReady: (() => void) | null = null;
	let rejectReady: ((error: Error) => void) | null = null;

	const stop = () => {
		if (intervalRef) {
			clearInterval(intervalRef);
			intervalRef = null;
		}
		torrentId = null;
		fatalHandled = false;
		if (rejectReady) {
			rejectReady(new Error("Torrent readiness wait canceled"));
		}
		readyPromise = null;
		resolveReady = null;
		rejectReady = null;
	};

	const start = (id: string) => {
		if (!id) return;
		if (intervalRef && torrentId === id) return;

		stop();
		torrentId = id;
		fatalHandled = false;
		readyPromise = new Promise<void>((resolve, reject) => {
			resolveReady = resolve;
			rejectReady = reject;
		});

		const poll = async () => {
			if (!torrentId) return;
			try {
				const data = await getLimboTorrent(torrentId);
				const stage = String(data.stage || "");
				const error = typeof data.lastError === "string" ? data.lastError : "";

				if (error || stage === "error") {
					loadingStage.set("Torrent error");
					loadingDetails.set(error || "Torrent error");
					loadingProgress.set(null);
					if (!fatalHandled) {
						fatalHandled = true;
						onTorrentError?.(error || "Torrent error");
					}
					rejectReady?.(new Error(error || "Torrent error"));
					resolveReady = null;
					rejectReady = null;
					return;
				}

				const copy = limboStatusCopy(data);
				if (get(loading) || stage === "metadata" || stage === "downloading") {
					loadingStage.set(copy.stage);
					loadingDetails.set(copy.details);
					loadingProgress.set(copy.progress);
				}

				if (stage === "ready" || stage === "done" || data.ready) {
					if (get(loading)) {
						loadingStage.set(copy.stage);
						loadingDetails.set(copy.details);
					}
					loadingProgress.set(null);
					resolveReady?.();
					resolveReady = null;
					rejectReady = null;
				}
			} catch {
				// ignore transient polling errors
			}
		};

		void poll();
		intervalRef = setInterval(poll, 1000);
	};

	const waitUntilReady = (id: string) => {
		start(id);
		return readyPromise ?? Promise.resolve();
	};

	return {
		start,
		stop,
		waitUntilReady,
	};
};
