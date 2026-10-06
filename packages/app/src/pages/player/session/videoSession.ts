// Client playback session helpers (direct / MediaBunny / addon HLS).
import type Hls from "hls.js";
import type { Track } from "../types";
import {
	getDirectMediaSupport,
	supportsEac3Playback,
} from "../../../lib/media/probe/nativeSupport";

type SeekingHandler = EventListener & { cancel?: () => void };

const seekingListeners = new WeakMap<HTMLVideoElement, SeekingHandler>();

export function detachSeekingListener(videoElem: HTMLVideoElement | null | undefined) {
	if (!videoElem) return;
	const prev = seekingListeners.get(videoElem);
	if (!prev) return;
	videoElem.removeEventListener("seeking", prev);
	prev.cancel?.();
	seekingListeners.delete(videoElem);
}

export function attachSeekingListener(
	videoElem: HTMLVideoElement,
	onSeeking: SeekingHandler,
) {
	detachSeekingListener(videoElem);
	seekingListeners.set(videoElem, onSeeking);
	videoElem.addEventListener("seeking", onSeeking);
}

export function isTimeBuffered(
	elem: HTMLVideoElement,
	target: number,
	tolerance = 0.5,
): boolean {
	const b = elem.buffered;
	if (!b || b.length === 0) return false;
	for (let i = 0; i < b.length; i++) {
		const start = b.start(i);
		const end = b.end(i);
		if (target >= start - tolerance && target <= end + tolerance) {
			return true;
		}
	}
	return false;
}

export function captureFrame(
	videoElem: HTMLVideoElement | null,
	canvasElem: HTMLCanvasElement | null,
) {
	if (!videoElem || !canvasElem) return;
	canvasElem.width = videoElem.videoWidth;
	canvasElem.height = videoElem.videoHeight;
	const ctx = canvasElem.getContext("2d");
	if (ctx) {
		try {
			ctx.drawImage(videoElem, 0, 0, canvasElem.width, canvasElem.height);
		} catch {
			// Cross-origin video can taint the canvas — skip.
		}
	}
}

export { supportsEac3Playback, getDirectMediaSupport };

export async function loadVideoSession(
	src: string,
	_fileIdx: number | null,
	_startTime: number,
	setStates: {
		setLoading: (loading: boolean) => void;
		setLoadingStage?: (stage: string) => void;
		setLoadingDetails?: (details: string) => void;
		setLoadingProgress?: (progress: number | null) => void;
		setShowCanvas: (show: boolean) => void;
		setIsPlaying: (playing: boolean) => void;
		setHasStarted: (started: boolean) => void;
		setShowError: (show: boolean) => void;
		setErrorMessage: (msg: string) => void;
		setErrorDetails: (details: string) => void;
		setCurrentTime: (time: number) => void;
		setDuration: (duration: number) => void;
		setCurrentChapter: (chapter: any) => void;
		setShowSkipIntro: (show: boolean) => void;
		setShowNextEpisode: (show: boolean) => void;
		setSeekGuard: (guard: boolean) => void;
		setFirstSeekLoad: (load: boolean) => void;
		setPendingSeek: (seek: number | null) => void;
		setAudioTracks: (tracks: Track[]) => void;
		setSubtitleTracks: (tracks: Track[]) => void;
		setCurrentAudioLabel: (label: string) => void;
		setCurrentSubtitleLabel: (label: string) => void;
		setSessionData?: (sessionData: any) => void;
	},
	fetchAddonSubtitles: () => Promise<void>,
	options?: {
		reuseSession?: { sessionData: any };
		directHttp?: boolean;
	},
): Promise<{ sessionData: any }> {
	const {
		setLoading,
		setLoadingStage,
		setLoadingDetails,
		setLoadingProgress,
		setShowCanvas,
		setIsPlaying,
		setHasStarted,
		setShowError,
		setErrorMessage,
		setErrorDetails,
		setCurrentTime,
		setDuration,
		setCurrentChapter,
		setShowSkipIntro,
		setShowNextEpisode,
		setSeekGuard,
		setFirstSeekLoad,
		setPendingSeek,
		setAudioTracks,
		setSubtitleTracks,
		setCurrentAudioLabel,
		setCurrentSubtitleLabel,
		setSessionData,
	} = setStates;

	try {
		const isReuse = Boolean(options?.reuseSession);
		if (!isReuse) {
			setLoading(true);
			setLoadingStage?.("Initializing player");
			setLoadingDetails?.("");
			setLoadingProgress?.(null);
		} else {
			setLoadingStage?.("Continuing");
			setLoadingDetails?.("");
			setLoadingProgress?.(null);
		}
		setShowCanvas(false);
		setIsPlaying(false);
		setHasStarted(false);
		setShowError(false);
		setErrorMessage("");
		setErrorDetails("");

		setCurrentTime(0);
		setDuration(0);
		setCurrentChapter(null);
		setShowSkipIntro(false);
		setShowNextEpisode(false);
		setSeekGuard(false);
		setFirstSeekLoad(false);
		setPendingSeek(null);

		setAudioTracks([]);
		setSubtitleTracks([]);
		setCurrentAudioLabel("Default");
		setCurrentSubtitleLabel("Off");

		if (options?.directHttp) {
			const sessionData = {
				isDirectHttp: true,
				sourceUrl: src,
				durationSeconds: 0,
			};
			setSessionData?.(sessionData);
			setSubtitleTracks([
				{ id: "off", label: "Off", selected: true, group: "None" },
			]);
			setLoadingStage?.("Loading subtitles");
			setLoadingDetails?.("Fetching addon subtitles...");
			await fetchAddonSubtitles();
			setLoadingDetails?.("");
			setLoadingProgress?.(null);
			return { sessionData };
		}

		throw new Error(
			src.startsWith("magnet:")
				? "Torrent playback requires Limbo. Install Limbo and enable Allow Torrenting."
				: "This stream cannot be played in-app. Try another source.",
		);
	} catch (err) {
		console.error("Error loading video:", err);
		setErrorMessage("Failed to initialize playback");
		setErrorDetails(err instanceof Error ? err.message : String(err));
		setShowError(true);
		setLoading(false);
		throw err;
	}
}

export function performSeek({
	targetTime,
	duration,
	videoElem,
	captureFrame,
	onAfterSeek,
	isWatchPartyHost,
	isPlaying,
	updatePlaybackState,
	setPendingSeek,
	setCurrentTime,
	setShowCanvas,
	hasPlaybackController,
}: {
	targetTime: number;
	duration: number;
	videoElem: HTMLVideoElement;
	captureFrame: () => void;
	onAfterSeek: () => void;
	isWatchPartyHost: boolean;
	isPlaying: boolean;
	updatePlaybackState: (time: number, playing: boolean) => void;
	setPendingSeek: (seek: number | null) => void;
	setCurrentTime: (time: number) => void;
	setShowCanvas: (show: boolean) => void;
	/** In-app playback seeks through its controller, which keeps the buffer fed. */
	hasPlaybackController: boolean;
}) {
	if (duration <= 0) return;
	const target = Math.max(0, Math.min(duration, targetTime));
	const buffered = isTimeBuffered(videoElem, target);

	setPendingSeek(target);
	if (hasPlaybackController) {
		if (!buffered) {
			captureFrame();
			setShowCanvas(true);
		}
		videoElem.dispatchEvent(new Event("seeking"));
	} else if (buffered) {
		videoElem.currentTime = target;
		setPendingSeek(null);
	} else {
		captureFrame();
		setShowCanvas(true);
		videoElem.currentTime = target;
	}
	setCurrentTime(target);
	onAfterSeek();

	if (isWatchPartyHost) {
		updatePlaybackState(target, isPlaying);
	}
}

export function createSeekHandler(
	videoElem: HTMLVideoElement,
	getPendingSeek: () => number | null,
	getSeekGuard: () => boolean,
	setStates: {
		setPendingSeek: (seek: number | null) => void;
		setSeekGuard: (guard: boolean) => void;
		setBuffering: (buffering: boolean) => void;
		setShowCanvas: (show: boolean) => void;
		setFirstSeekLoad: (load: boolean) => void;
		setShowError: (show: boolean) => void;
		setErrorMessage: (message: string) => void;
		setErrorDetails: (details: string) => void;
	},
	getPlaybackController?: () => { seek: (time: number) => Promise<void> } | null,
	getShouldResume?: () => boolean,
	directSeekTimeoutMs = 15_000,
) {
	const {
		setPendingSeek,
		setSeekGuard,
		setBuffering,
		setShowCanvas,
		setFirstSeekLoad,
		setShowError,
		setErrorMessage,
		setErrorDetails,
	} = setStates;

	let seekGeneration = 0;
	let resumeAfterSeek = false;
	let activeDirectCleanup: (() => void) | null = null;

	const settle = (generation: number) => {
		if (generation !== seekGeneration) return false;
		setSeekGuard(false);
		setBuffering(false);
		setShowCanvas(false);
		return true;
	};

	const resume = () => {
		if (resumeAfterSeek && videoElem.paused) {
			void videoElem.play().catch(() => {
				// ignore autoplay restrictions
			});
		}
	};

	const showSeekError = (error: unknown) => {
		console.error("Failed to prepare seek", error);
		setShowError(true);
		setErrorMessage("Failed to seek");
		setErrorDetails(error instanceof Error ? error.message : String(error));
	};

	const rememberPlayState = () => {
		if (!getSeekGuard()) resumeAfterSeek = getShouldResume?.() ?? !videoElem.paused;
	};

	const beginSeek = () => {
		rememberPlayState();
		setSeekGuard(true);
		setBuffering(true);
		setShowCanvas(true);
		setFirstSeekLoad(true);
		return ++seekGeneration;
	};

	/** A newer seek replaces one still loading instead of waiting for it. */
	const seekWithController = async (
		controller: { seek: (time: number) => Promise<void> },
		target: number,
	) => {
		let generation: number;
		if (isTimeBuffered(videoElem, target, 0)) {
			rememberPlayState();
			generation = ++seekGeneration;
		} else {
			generation = beginSeek();
		}
		try {
			await controller.seek(target);
			if (settle(generation)) resume();
		} catch (error) {
			if (!settle(generation)) return;
			if (error instanceof DOMException && error.name === "AbortError") return;
			showSeekError(error);
		}
	};

	const handler = async () => {
		const pending = getPendingSeek();
		if (pending == null) return;

		const playbackController = getPlaybackController?.() ?? null;
		if (playbackController) {
			setPendingSeek(null);
			await seekWithController(playbackController, pending);
			return;
		}

		if (getSeekGuard()) return;
		setPendingSeek(null);
		if (isTimeBuffered(videoElem, pending)) {
			videoElem.currentTime = pending;
			return;
		}

		const generation = beginSeek();
		const finishDirect = () => {
			if (!settle(generation)) return;
			resume();
			void handler();
		};

		let timeout: ReturnType<typeof setTimeout> | null = null;
		const cleanup = () => {
			if (timeout != null) {
				clearTimeout(timeout);
				timeout = null;
			}
			videoElem.removeEventListener("seeked", onSeeked);
			videoElem.removeEventListener("error", onError);
			if (activeDirectCleanup === cleanup) {
				activeDirectCleanup = null;
			}
		};
		activeDirectCleanup = cleanup;
		const onSeeked = () => {
			if (generation !== seekGeneration) return;
			cleanup();
			finishDirect();
		};
		const onError = () => {
			if (generation !== seekGeneration) return;
			cleanup();
			if (!settle(generation)) return;
			showSeekError(new Error("Seek failed"));
			void handler();
		};

		videoElem.addEventListener("seeked", onSeeked);
		videoElem.addEventListener("error", onError);
		timeout = setTimeout(() => {
			if (generation !== seekGeneration) return;
			cleanup();
			finishDirect();
		}, directSeekTimeoutMs);
		if (Math.abs(videoElem.currentTime - pending) > 0.05) {
			videoElem.currentTime = pending;
		}
	};

	const seekingHandler = handler as SeekingHandler;
	seekingHandler.cancel = () => {
		seekGeneration += 1;
		activeDirectCleanup?.();
		activeDirectCleanup = null;
	};
	return seekingHandler;
}

export function cleanupSession(
	hls: Hls | null,
	clearActivity: () => void,
	leaveWatchParty: () => void,
	isWatchPartyActive: boolean,
	videoElem?: HTMLVideoElement | null,
) {
	clearActivity();

	if (isWatchPartyActive) {
		leaveWatchParty();
	}

	if (hls) {
		hls.destroy();
	}

	detachSeekingListener(videoElem);
}

export async function handleAudioSelect(
	track: Track,
	audioTracks: Track[],
	videoElem: HTMLVideoElement,
	setStates: {
		setAudioTracks: (tracks: Track[]) => void;
		setCurrentAudioLabel: (label: string) => void;
		setLoading: (loading: boolean) => void;
		setLoadingStage: (stage: string) => void;
	},
	getPlaybackController: () => {
		setAudioTrack: (index: number, time: number) => Promise<void>;
	} | null,
) {
	const { setAudioTracks, setCurrentAudioLabel, setLoading, setLoadingStage } = setStates;

	if (track.selected) return;

	setAudioTracks(audioTracks.map((t) => ({ ...t, selected: t.id === track.id })));
	setCurrentAudioLabel(track.label);

	const wasPlaying = !videoElem.paused;
	try {
		setLoading(true);
		setLoadingStage("Switching audio track");

		const playbackController = getPlaybackController();
		if (!playbackController) {
			throw new Error("Audio track switching needs in-app remux for this stream");
		}

		const audioIndex = typeof track.id === "number" ? track.id : Number(track.id);
		if (!Number.isFinite(audioIndex)) {
			throw new Error("Invalid audio track");
		}
		await playbackController.setAudioTrack(audioIndex, videoElem.currentTime);
		if (wasPlaying) {
			void videoElem.play().catch(() => {
				// ignore
			});
		}
	} catch (err) {
		console.error("Failed to switch audio:", err);
	} finally {
		setLoading(false);
		setLoadingStage("");
	}
}
