// Client playback session helpers (direct / MediaBunny / addon HLS).
import type Hls from "hls.js";
import type { Track } from "./types";
import { trackEvent } from "../../lib/analytics";
import {
	getDirectMediaSupport,
	supportsEac3Playback,
} from "../../lib/media/nativeSupport";

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
		setPlaybackOffset: (offset: number) => void;
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
		setPlaybackOffset,
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
		setPlaybackOffset(0);
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
		const sourceType = src.startsWith("magnet:")
			? "torrent"
			: src.startsWith("http://") || src.startsWith("https://")
				? "direct"
				: "local";
		trackEvent("stream_load_failed", {
			source_type: sourceType,
			is_torrent: sourceType === "torrent",
			is_local: sourceType === "local",
			error_name: err instanceof Error ? err.name : "unknown",
		});
		setErrorMessage("Failed to initialize playback");
		setErrorDetails(err instanceof Error ? err.message : String(err));
		setShowError(true);
		setLoading(false);
		throw err;
	}
}

export function performSeek(
	targetGlobal: number,
	duration: number,
	playbackOffset: number,
	videoElem: HTMLVideoElement | null,
	captureFrameFn: () => void,
	updateDiscordActivity: () => void,
	isWatchPartyHost: boolean,
	ignoreNextSeek: boolean,
	isPlaying: boolean,
	updatePlaybackState: (time: number, playing: boolean) => void,
	setStates: {
		setPendingSeek: (seek: number | null) => void;
		setCurrentTime: (time: number) => void;
		setShowCanvas: (show: boolean) => void;
		setIgnoreNextSeek: (ignore: boolean) => void;
	},
	opts?: {
		/** MediaBunny rebuilds MSE on unbuffered seeks — don't poke the old element. */
		clientRemuxHardSeek?: boolean;
	},
) {
	const { setPendingSeek, setCurrentTime, setShowCanvas, setIgnoreNextSeek } =
		setStates;

	if (!videoElem || duration <= 0) return;

	targetGlobal = Math.max(0, Math.min(duration, targetGlobal));

	setPendingSeek(targetGlobal);
	const localTarget = targetGlobal - playbackOffset;

	if (isTimeBuffered(videoElem, localTarget)) {
		videoElem.currentTime = localTarget;
		setPendingSeek(null);
	} else if (opts?.clientRemuxHardSeek) {
		try {
			videoElem.pause();
		} catch {
			// ignore
		}
		captureFrameFn();
		setShowCanvas(true);
		videoElem.dispatchEvent(new Event("seeking"));
	} else {
		captureFrameFn();
		setShowCanvas(true);
		videoElem.currentTime = Math.max(localTarget, 0);
	}
	setCurrentTime(targetGlobal);
	updateDiscordActivity();

	if (isWatchPartyHost && !ignoreNextSeek) {
		updatePlaybackState(targetGlobal, isPlaying);
	}
	setIgnoreNextSeek(false);
}

export function createSeekHandler(
	videoElem: HTMLVideoElement,
	getPendingSeek: () => number | null,
	getSeekGuard: () => boolean,
	getPlaybackOffset: () => number,
	getSubtitleTracks: () => Track[],
	getCurrentSubtitleLabel: () => string,
	handleSubtitleSelect: (track: Track) => void,
	setStates: {
		setPendingSeek: (seek: number | null) => void;
		setSeekGuard: (guard: boolean) => void;
		setBuffering: (buffering: boolean) => void;
		setShowCanvas: (show: boolean) => void;
		setFirstSeekLoad: (load: boolean) => void;
		setPlaybackOffset: (offset: number) => void;
		setShowError: (show: boolean) => void;
		setErrorMessage: (message: string) => void;
		setErrorDetails: (details: string) => void;
	},
	getPlaybackController?: () => {
		seek: (time: number) => Promise<number>;
		setAudioTrack?: (index: number, globalTime: number) => Promise<number>;
	} | null,
	getShouldResume?: () => boolean,
	directSeekTimeoutMs = 15_000,
) {
	const {
		setPendingSeek,
		setSeekGuard,
		setBuffering,
		setShowCanvas,
		setFirstSeekLoad,
		setPlaybackOffset,
		setShowError,
		setErrorMessage,
		setErrorDetails,
	} = setStates;

	let seekGeneration = 0;
	let activeDirectCleanup: (() => void) | null = null;

	const reapplyActiveSubtitle = () => {
		const currentSubtitleLabel = getCurrentSubtitleLabel();
		if (currentSubtitleLabel === "Off") return;
		const track = getSubtitleTracks().find((t) => t.selected);
		if (track) {
			handleSubtitleSelect(track);
		}
	};

	const handler = async () => {
		if (!videoElem) return;
		if (getSeekGuard()) return;

		const pending = getPendingSeek();
		if (pending == null) return;

		const desiredGlobal = pending;
		setPendingSeek(null);
		const playbackOffset = getPlaybackOffset();
		const localTarget = desiredGlobal - playbackOffset;
		const playbackController = getPlaybackController?.() ?? null;

		if (!playbackController && isTimeBuffered(videoElem, localTarget)) {
			videoElem.currentTime = localTarget;
			return;
		}
		if (playbackController && localTarget >= 0 && isTimeBuffered(videoElem, localTarget)) {
			videoElem.currentTime = localTarget;
			return;
		}

		const generation = ++seekGeneration;
		const wasPlaying = getShouldResume?.() ?? !videoElem.paused;
		setSeekGuard(true);
		setBuffering(true);
		setShowCanvas(true);
		setFirstSeekLoad(true);

		const finishSuccess = () => {
			if (generation !== seekGeneration) return;
			setSeekGuard(false);
			setBuffering(false);
			setShowCanvas(false);
			reapplyActiveSubtitle();
			void handler();
		};

		const finishFailure = (error: unknown) => {
			if (generation !== seekGeneration) return;
			setSeekGuard(false);
			setBuffering(false);
			setShowCanvas(false);
			if (error instanceof DOMException && error.name === "AbortError") {
				void handler();
				return;
			}
			console.error("Failed to prepare seek", error);
			setShowError(true);
			setErrorMessage("Failed to seek");
			setErrorDetails(error instanceof Error ? error.message : String(error));
			void handler();
		};

		if (playbackController) {
			try {
				videoElem.pause();
				setPlaybackOffset(desiredGlobal);
				const snapped = await playbackController.seek(desiredGlobal);
				if (generation !== seekGeneration) return;
				setPlaybackOffset(snapped);
				if (wasPlaying) {
					try {
						await videoElem.play();
					} catch {
						// ignore autoplay restrictions
					}
				}
				finishSuccess();
			} catch (error) {
				finishFailure(error);
			}
			return;
		}

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
			if (wasPlaying) {
				videoElem.play().catch((err) => {
					console.warn("play after seek failed:", err);
				});
			}
			finishSuccess();
		};
		const onError = () => {
			if (generation !== seekGeneration) return;
			cleanup();
			finishFailure(new Error("Seek failed"));
		};

		videoElem.addEventListener("seeked", onSeeked);
		videoElem.addEventListener("error", onError);
		timeout = setTimeout(() => {
			if (generation !== seekGeneration) return;
			cleanup();
			setSeekGuard(false);
			setBuffering(false);
			setShowCanvas(false);
			if (wasPlaying && videoElem.paused) {
				void videoElem.play().catch(() => {
					// ignore
				});
			}
			void handler();
		}, directSeekTimeoutMs);
		try {
			const target = Math.max(localTarget, 0);
			if (Math.abs(videoElem.currentTime - target) > 0.05) {
				videoElem.currentTime = target;
			}
		} catch (error) {
			cleanup();
			finishFailure(error);
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
	currentTime: number,
	videoElem: HTMLVideoElement,
	setStates: {
		setAudioTracks: (tracks: Track[]) => void;
		setCurrentAudioLabel: (label: string) => void;
		setLoading?: (loading: boolean) => void;
		setLoadingStage?: (stage: string) => void;
		setPlaybackOffset?: (offset: number) => void;
	},
	getPlaybackController?: () => {
		seek: (time: number) => Promise<number>;
		setAudioTrack: (index: number, globalTime: number) => Promise<number>;
	} | null,
) {
	const { setAudioTracks, setCurrentAudioLabel, setLoading, setLoadingStage, setPlaybackOffset } =
		setStates;

	if (track.selected) return;

	const updatedTracks = audioTracks.map((t) => ({
		...t,
		selected: t.id === track.id,
	}));
	setAudioTracks(updatedTracks);
	setCurrentAudioLabel(track.label);

	try {
		if (setLoading) setLoading(true);
		if (setLoadingStage) setLoadingStage("Switching audio track");

		const playbackController = getPlaybackController?.() ?? null;
		if (!playbackController) {
			throw new Error("Audio track switching needs in-app remux for this stream");
		}

		const audioIndex = typeof track.id === "number" ? track.id : Number(track.id);
		if (!Number.isFinite(audioIndex)) {
			throw new Error("Invalid audio track");
		}
		setPlaybackOffset?.(currentTime);
		const snapped = await playbackController.setAudioTrack(audioIndex, currentTime);
		setPlaybackOffset?.(snapped);
		if (!videoElem.paused) {
			void videoElem.play().catch(() => {
				// ignore
			});
		}
		if (setLoading) setLoading(false);
		if (setLoadingStage) setLoadingStage("");
	} catch (err) {
		console.error("Failed to switch audio:", err);
		if (setLoading) setLoading(false);
		if (setLoadingStage) setLoadingStage("");
	}
}
