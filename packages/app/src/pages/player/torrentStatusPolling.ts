import { get } from "svelte/store";
import {
	getLimboTorrent,
	LimboApiError,
	LimboUnavailableError,
	type LimboTorrentStatus,
} from "../../lib/limbo/client";
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
	let timeoutRef: ReturnType<typeof setTimeout> | null = null;
	let torrentId: string | null = null;
	let fatalHandled = false;
	let unavailableFailures = 0;
	let readyPromise: Promise<void> | null = null;
	let resolveReady: (() => void) | null = null;
	let rejectReady: ((error: Error) => void) | null = null;

	const stop = () => {
		if (timeoutRef) {
			clearTimeout(timeoutRef);
			timeoutRef = null;
		}
		torrentId = null;
		fatalHandled = false;
		unavailableFailures = 0;
		if (rejectReady) {
			rejectReady(new Error("Torrent readiness wait canceled"));
		}
		readyPromise = null;
		resolveReady = null;
		rejectReady = null;
	};

	const start = (id: string) => {
		if (!id) return;
		if (torrentId === id && readyPromise) return;

		stop();
		torrentId = id;
		fatalHandled = false;
		readyPromise = new Promise<void>((resolve, reject) => {
			resolveReady = resolve;
			rejectReady = reject;
		});

		const fail = (message: string) => {
			loadingStage.set("Torrent error");
			loadingDetails.set(message);
			loadingProgress.set(null);
			if (!fatalHandled) {
				fatalHandled = true;
				onTorrentError?.(message);
			}
			rejectReady?.(new Error(message));
			resolveReady = null;
			rejectReady = null;
		};

		const poll = async () => {
			const activeId = torrentId;
			if (!activeId) return;
			try {
				const data = await getLimboTorrent(activeId);
				unavailableFailures = 0;
				const stage = String(data.stage || "");
				const error = typeof data.lastError === "string" ? data.lastError : "";

				if (error || stage === "error") {
					fail(error || "Torrent error");
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
			} catch (error) {
				if (error instanceof LimboUnavailableError) {
					unavailableFailures += 1;
					if (unavailableFailures >= 3) fail("Lost connection to Limbo");
				} else if (error instanceof LimboApiError) {
					fail(error.message);
				} else {
					fail(error instanceof Error ? error.message : "Limbo status failed");
				}
			} finally {
				if (torrentId === activeId && !fatalHandled) {
					timeoutRef = setTimeout(poll, 1000);
				}
			}
		};

		void poll();
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
