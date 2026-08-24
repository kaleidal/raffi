const READY_STATE_NAMES = [
	"nothing",
	"metadata",
	"current-data",
	"future-data",
	"enough-data",
] as const;

const NETWORK_STATE_NAMES = ["empty", "idle", "loading", "no-source"] as const;

function rounded(value: number) {
	return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function readRanges(ranges: TimeRanges) {
	const values: Array<[number, number]> = [];
	for (let index = 0; index < ranges.length; index += 1) {
		values.push([rounded(ranges.start(index)) ?? 0, rounded(ranges.end(index)) ?? 0]);
	}
	return values;
}

export function describeMediaSource(value: string) {
	if (!value) return "none";
	try {
		const url = new URL(value);
		const extension = url.pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
		return `${url.protocol}//${url.host}${extension ? `/*.${extension}` : "/*"}`;
	} catch {
		return value.startsWith("blob:") ? "blob:media-source" : "local-media";
	}
}

export function readPlaybackSnapshot(video: HTMLVideoElement) {
	const error = video.error;
	return {
		mode: video.dataset.raffiPlaybackMode || "unknown",
		source: describeMediaSource(video.currentSrc || video.src),
		currentTime: rounded(video.currentTime),
		duration: rounded(video.duration),
		readyState: `${video.readyState}:${READY_STATE_NAMES[video.readyState] ?? "unknown"}`,
		networkState: `${video.networkState}:${NETWORK_STATE_NAMES[video.networkState] ?? "unknown"}`,
		buffered: readRanges(video.buffered),
		seekable: readRanges(video.seekable),
		paused: video.paused,
		seeking: video.seeking,
		ended: video.ended,
		playbackRate: video.playbackRate,
		resolution: `${video.videoWidth}x${video.videoHeight}`,
		error: error ? { code: error.code, message: error.message } : null,
	};
}

export function attachPlaybackDiagnostics(video: HTMLVideoElement, surface: string) {
	let waitingInterval: ReturnType<typeof setInterval> | null = null;
	let waitingStartedAt = 0;
	let lastTimeLog = -Infinity;
	let lastProgressState = "";

	const log = (event: string, extra?: Record<string, unknown>) => {
		console.info("[Raffi playback]", event, {
			surface,
			...readPlaybackSnapshot(video),
			...extra,
		});
	};

	const stopWaitingReports = () => {
		if (waitingInterval == null) return;
		clearInterval(waitingInterval);
		waitingInterval = null;
	};

	const startWaitingReports = () => {
		if (waitingInterval != null) return;
		waitingStartedAt = performance.now();
		waitingInterval = setInterval(() => {
			log("still-waiting", {
				waitingMs: Math.round(performance.now() - waitingStartedAt),
			});
		}, 2_000);
	};

	const handleEvent = (event: Event) => {
		if (event.type === "timeupdate") {
			if (video.currentTime - lastTimeLog < 5) return;
			lastTimeLog = video.currentTime;
		}

		if (event.type === "progress") {
			const snapshot = readPlaybackSnapshot(video);
			const state = JSON.stringify([snapshot.networkState, snapshot.buffered]);
			if (state === lastProgressState) return;
			lastProgressState = state;
		}

		if (event.type === "waiting" || event.type === "stalled") {
			startWaitingReports();
		} else if (["playing", "canplay", "seeked", "ended", "error", "abort", "emptied"].includes(event.type)) {
			stopWaitingReports();
		}

		log(event.type);
	};

	const events = [
		"loadstart",
		"loadedmetadata",
		"loadeddata",
		"canplay",
		"canplaythrough",
		"play",
		"playing",
		"pause",
		"waiting",
		"stalled",
		"suspend",
		"progress",
		"abort",
		"emptied",
		"seeking",
		"seeked",
		"ended",
		"error",
		"timeupdate",
	] as const;

	for (const event of events) video.addEventListener(event, handleEvent);
	log("diagnostics-attached");

	return () => {
		stopWaitingReports();
		for (const event of events) video.removeEventListener(event, handleEvent);
	};
}

export function logPlaybackPlan(
	source: string,
	plan: {
		mode: string;
		reason: string;
		error?: string;
		meta?: {
			durationSeconds?: number;
			video?: { codec?: string | null; codecString?: string | null; canDecode?: boolean; width?: number; height?: number } | null;
			audio?: { codec?: string | null; codecString?: string | null; canDecode?: boolean; channels?: number } | null;
			audioTracks?: unknown[];
		} | null;
	},
) {
	console.info("[Raffi playback] plan", {
		source: describeMediaSource(source),
		mode: plan.mode,
		reason: plan.reason,
		error: plan.error,
		duration: rounded(plan.meta?.durationSeconds ?? Number.NaN),
		video: plan.meta?.video ?? null,
		audio: plan.meta?.audio ?? null,
		audioTrackCount: plan.meta?.audioTracks?.length ?? 0,
	});
}
