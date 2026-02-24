// Video session and HLS management
import Hls from "hls.js";
import {
    createSession,
    getSessionUrl,
    getStreamUrl,
    serverUrl,
} from "../../lib/client";
import type { SessionData, Track } from "./types";
import { trackEvent } from "../../lib/analytics";

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
    canvasElem: HTMLCanvasElement | null
) {
    if (!videoElem || !canvasElem) return;
    canvasElem.width = videoElem.videoWidth;
    canvasElem.height = videoElem.videoHeight;
    const ctx = canvasElem.getContext("2d");
    if (ctx) {
        try {
            ctx.drawImage(
                videoElem,
                0,
                0,
                canvasElem.width,
                canvasElem.height,
            );
        } catch {
            // Cross-origin video (e.g. direct debrid links) can taint the canvas.
            // In that case, just skip the frame capture.
        }
    }
}

export function supportsEac3Playback(videoElem?: HTMLVideoElement): boolean {
    const elem = videoElem ?? document.createElement("video");

    const candidates = [
        'audio/mp4; codecs="ec-3"',
        'audio/mp4; codecs="ec-3, mp4a.40.2"',
        'video/mp4; codecs="avc1.42E01E, ec-3"',
        'video/mp4; codecs="hvc1.1.6.L93.B0, ec-3"',
    ];

    for (const type of candidates) {
        const res = elem.canPlayType(type);
        if (res === "probably" || res === "maybe") return true;
    }
    return false;
}

export function shouldBypassServerForHttpStream(
    src: string,
    videoElem?: HTMLVideoElement,
): boolean {
    if (!src) return false;
    if (!/^https?:\/\//i.test(src)) return false;

    // If the addon already provides an HLS manifest, let the existing pipeline handle it.
    if (/\.m3u8(\?|$)/i.test(src)) return false;

    return supportsEac3Playback(videoElem);
}

export async function loadVideoSession(
    src: string,
    fileIdx: number | null,
    startTime: number,
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
    },
    fetchAddonSubtitles: () => Promise<void>
): Promise<{ sessionId: string; sessionData: any }> {
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
    } = setStates;

    try {
        setLoading(true);
        setLoadingStage?.("Initializing player");
        setLoadingDetails?.("");
        setLoadingProgress?.(null);
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

        const kind = src.startsWith("magnet:") ? "torrent" : "http";
        let sessionId: string;

        if (fileIdx !== null && fileIdx !== undefined) {
            console.log(
                "Creating torrent session with file index:",
                fileIdx,
            );

            setLoadingStage?.("Creating torrent session");
            setLoadingDetails?.("Adding torrent and selecting file...");
            sessionId = await createSession(src, kind, startTime, fileIdx);
        } else {

            setLoadingStage?.(
                kind === "torrent" ? "Creating torrent session" : "Creating stream session",
            );
            setLoadingDetails?.(
                kind === "torrent"
                    ? "Adding torrent and fetching metadata..."
                    : "Contacting local server...",
            );
            sessionId = await createSession(src, kind, startTime);
        }
        setPlaybackOffset(startTime);

        setLoadingStage?.("Loading stream info");
        setLoadingDetails?.("Probing metadata and tracks...");

        const res = await fetch(`${serverUrl}/sessions/${sessionId}`);
        if (!res.ok) throw new Error("Failed to load session info");
        const sessionData = await res.json();
        if (sessionData.chapters) {
            console.log("Loaded chapters:", sessionData.chapters);
        }
        setDuration(sessionData.durationSeconds || 0);

        if (!sessionData.durationSeconds || sessionData.durationSeconds <= 0) {
            const refreshDuration = async () => {
                for (let attempt = 0; attempt < 18; attempt++) {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    try {
                        const nextRes = await fetch(`${serverUrl}/sessions/${sessionId}`);
                        if (!nextRes.ok) continue;
                        const nextData = await nextRes.json();
                        const nextDuration = Number(nextData?.durationSeconds || 0);
                        if (Number.isFinite(nextDuration) && nextDuration > 0) {
                            setDuration(nextDuration);
                            break;
                        }
                    } catch {
                        continue;
                    }
                }
            };

            void refreshDuration();
        }

        if (sessionData.availableStreams) {
            const audioTracks = sessionData.availableStreams
                .filter((s: any) => s.type === "audio")
                .map((s: any) => ({
                    id: s.index,
                    label: s.title || s.language || `Audio ${s.index}`,
                    selected: s.index === (sessionData.audioIndex || 0),
                    group: "Embedded",
                }));

            const subtitleTracks = [
                { id: "off", label: "Off", selected: true, group: "None" },
            ];

            setAudioTracks(audioTracks);
            setSubtitleTracks(subtitleTracks);

            const selectedAudio = audioTracks.find((t: Track) => t.selected);
            if (selectedAudio) setCurrentAudioLabel(selectedAudio.label);
        }

		setLoadingStage?.("Loading subtitles");
		setLoadingDetails?.("Fetching addon subtitles...");
        await fetchAddonSubtitles();
		setLoadingDetails?.("");
		setLoadingProgress?.(null);

        return { sessionId, sessionData };
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

export function initHLS(
    videoElem: HTMLVideoElement,
    sessionId: string,
    startOffset: number,
    autoPlay: boolean,
    onSeeking: () => void,
    setStates: {
        setLoading: (loading: boolean) => void;
        setShowCanvas: (show: boolean) => void;
        setPlaybackOffset: (offset: number) => void;
        setShowError: (show: boolean) => void;
        setErrorMessage: (msg: string) => void;
        setErrorDetails: (details: string) => void;
    }
): Hls | null {
    const { setLoading, setShowCanvas, setPlaybackOffset, setShowError, setErrorMessage, setErrorDetails } = setStates;

    const treatAsLocalFile = videoElem?.dataset?.raffiSource === "local";
    let didEnforceInitialStart = false;
    const enforceLocalStartAtZero = () => {
        if (didEnforceInitialStart) return;
        if (startOffset !== 0) return;
        if (!Number.isFinite(videoElem.duration) || videoElem.duration <= 0) return;
        if (!Number.isFinite(videoElem.currentTime)) return;

        if (videoElem.currentTime > 1) {
            try {
                videoElem.currentTime = 0;
                didEnforceInitialStart = true;
            } catch {
                // ignore
            }
        }
    };

    let baseManifest = `${getStreamUrl(sessionId)}/child.m3u8`;
    setPlaybackOffset(startOffset);
    
    if (startOffset === 0) {
        videoElem.currentTime = 0;
    }

    let hls: Hls | null = null;

    if (Hls.isSupported()) {
        hls = new Hls({
            lowLatencyMode: false,
            maxBufferLength: 50,
            maxMaxBufferLength: 80,
            backBufferLength: 30,
            maxBufferHole: 0,
            maxFragLookUpTolerance: 0,
            enableWorker: true,
            appendErrorMaxRetry: 20,
            manifestLoadingTimeOut: 30000,
            manifestLoadingMaxRetry: 10,
            manifestLoadingMaxRetryTimeout: 30000,
            levelLoadingTimeOut: 30000,
            levelLoadingMaxRetry: 10,
            levelLoadingMaxRetryTimeout: 30000,
            fragLoadPolicy: {
                default: {
                    maxTimeToFirstByteMs: 10000,
                    maxLoadTimeMs: 120000,
                    timeoutRetry: {
                        maxNumRetry: 20,
                        retryDelayMs: 0,
                        maxRetryDelayMs: 15,
                    },
                    errorRetry: {
                        maxNumRetry: 6,
                        retryDelayMs: 1000,
                        maxRetryDelayMs: 8000,
                    },
                },
            },
        });

        const onInitialParsed = () => {
            hls?.off(Hls.Events.MANIFEST_PARSED, onInitialParsed);
            console.log("HLS MANIFEST_PARSED (initial)");
            setLoading(false);
            setShowCanvas(false);

            // Best-effort: after manifest is parsed, browsers typically have enough info
            // for currentTime corrections to stick.
            enforceLocalStartAtZero();
            setTimeout(enforceLocalStartAtZero, 200);
            setTimeout(enforceLocalStartAtZero, 600);

            if (autoPlay) {
                videoElem.play().catch((err) => {
                    console.warn("autoplay failed:", err);
                });
            }
        };

        hls.on(Hls.Events.MANIFEST_LOADED, (_, data) => {
            console.log("MANIFEST_LOADED data:", data);
            if (
                data.networkDetails &&
                data.networkDetails instanceof XMLHttpRequest
            ) {
                console.log("Network details is XHR");
                const startHeader = data.networkDetails.getResponseHeader(
                    "X-Raffi-Slice-Start",
                );
                if (startHeader) {
                    const val = parseFloat(startHeader);
                    if (!isNaN(val)) {
                        console.log("Received slice start offset:", val);
                        // For local files, we want strict, stable offsets (and local seeks)
                        // and the server may be mid-transcode; don't let header updates yank the offset.
                        if (!treatAsLocalFile) {
                            setPlaybackOffset(val);
                        }
                    } else {
                        console.warn(
                            "Invalid slice start header:",
                            startHeader,
                        );
                    }
                } else {
                    console.warn("No X-Raffi-Slice-Start header found");
                }
            }
        });

        hls.on(Hls.Events.MANIFEST_PARSED, onInitialParsed);

        let networkRetries = 0;
        let mediaRetries = 0;
        const MAX_NETWORK_RETRIES = 5;
        const MAX_MEDIA_RETRIES = 3;

        hls.on(Hls.Events.ERROR, (_, data) => {
            console.error("HLS ERROR", data);
            if (data.fatal) {
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        networkRetries++;
                        if (networkRetries <= MAX_NETWORK_RETRIES) {
                            console.log(`fatal network error, retry ${networkRetries}/${MAX_NETWORK_RETRIES}`);
                            hls?.startLoad();
                        } else {
                            hls?.destroy();
                            setErrorMessage("Network error");
                            setErrorDetails("Failed to load stream after multiple retries. Please try again or select another stream.");
                            setShowError(true);
                            setLoading(false);
                        }
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        mediaRetries++;
                        if (mediaRetries <= MAX_MEDIA_RETRIES) {
                            console.log(`fatal media error, retry ${mediaRetries}/${MAX_MEDIA_RETRIES}`);
                            hls?.recoverMediaError();
                        } else {
                            hls?.destroy();
                            setErrorMessage("Media error");
                            setErrorDetails("Failed to decode stream. Please try another stream.");
                            setShowError(true);
                            setLoading(false);
                        }
                        break;
                    default:
                        hls?.destroy();
                        setErrorMessage("Failed to load stream");
                        setErrorDetails(data.details || "");
                        setShowError(true);
                        setLoading(false);
                        break;
                }
            }
        });

        hls.loadSource(baseManifest);
        hls.attachMedia(videoElem);

        // Extra safety for offset-start sources (one-shot only).
        videoElem.addEventListener("loadedmetadata", enforceLocalStartAtZero, { once: true });
    } else if (videoElem.canPlayType("application/vnd.apple.mpegurl")) {
        videoElem.src = baseManifest;
        videoElem.addEventListener("loadedmetadata", () => {
            enforceLocalStartAtZero();
            if (autoPlay) {
                videoElem.play().catch((err) => {
                    console.warn("autoplay failed:", err);
                });
            }
        });
    } else {
        console.error("No HLS support");
    }

    videoElem.addEventListener("seeking", onSeeking);

    return hls;
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
    }
) {
    const { setPendingSeek, setCurrentTime, setShowCanvas, setIgnoreNextSeek } = setStates;

    if (!videoElem || duration <= 0) return;

    targetGlobal = Math.max(0, Math.min(duration, targetGlobal));

    setPendingSeek(targetGlobal);
    const localTarget = targetGlobal - playbackOffset;

    if (isTimeBuffered(videoElem, localTarget)) {
        videoElem.currentTime = localTarget;
        setPendingSeek(null);
    } else {
        captureFrameFn();
        setShowCanvas(true);
        videoElem.currentTime = Math.max(localTarget, 0);
    }
    setCurrentTime(targetGlobal);
    updateDiscordActivity();

    // Broadcast to watch party if host
    if (isWatchPartyHost && !ignoreNextSeek) {
        updatePlaybackState(targetGlobal, isPlaying);
    }
    setIgnoreNextSeek(false);
}

export function createSeekHandler(
    videoElem: HTMLVideoElement,
    getHls: () => Hls | null,
    sessionId: string,
    getPendingSeek: () => number | null,
    getSeekGuard: () => boolean,
    getPlaybackOffset: () => number,
    getSubtitleTracks: () => Track[],
    getCurrentSubtitleLabel: () => string,
    handleSubtitleSelect: (track: Track) => void,
    setStates: {
        setPendingSeek: (seek: number | null) => void;
        setSeekGuard: (guard: boolean) => void;
        setLoading: (loading: boolean) => void;
        setShowCanvas: (show: boolean) => void;
        setFirstSeekLoad: (load: boolean) => void;
        setPlaybackOffset: (offset: number) => void;
    }
) {
    const { setPendingSeek, setSeekGuard, setLoading, setShowCanvas, setFirstSeekLoad, setPlaybackOffset } = setStates;

    return () => {
        if (!videoElem) return;
        const pending = getPendingSeek();
        if (pending == null || getSeekGuard()) return;

        const desiredGlobal = pending;
        setPendingSeek(null);
        const playbackOffset = getPlaybackOffset();
        const localTarget = desiredGlobal - playbackOffset;

        if (isTimeBuffered(videoElem, localTarget)) {
            videoElem.currentTime = localTarget;
            return;
        }

        setSeekGuard(true);
        setLoading(true);
        setShowCanvas(true);
        setFirstSeekLoad(true);
        const seekId = Math.random().toString(36).substring(7);
        const url = `${getStreamUrl(sessionId)}/child.m3u8?seek=${Math.floor(desiredGlobal)}&seek_id=${seekId}&force_slice=1`;
        console.log("Hard seek to", desiredGlobal, "->", url);

        const hlsInstance = getHls();

        if (hlsInstance) {
            const onSeekParsed = () => {
                console.log("HLS MANIFEST_PARSED (seek)");
                setPlaybackOffset(desiredGlobal);
                setSeekGuard(false);
                setLoading(false);
                setShowCanvas(false);

                // Re-fetch subtitles if active
                const currentSubtitleLabel = getCurrentSubtitleLabel();
                if (currentSubtitleLabel !== "Off") {
                    const track = getSubtitleTracks().find((t) => t.selected);
                    if (track) {
                        handleSubtitleSelect(track);
                    }
                }

                videoElem.play().catch((err) => {
                    console.warn("play after seek failed:", err);
                });

                hlsInstance?.off(Hls.Events.MANIFEST_PARSED, onSeekParsed);
            };

            hlsInstance.on(Hls.Events.MANIFEST_PARSED, onSeekParsed);
            hlsInstance.loadSource(url);
            hlsInstance.startLoad(0);
        } else {
            videoElem.src = url;
            videoElem.onloadedmetadata = () => {
                setPlaybackOffset(desiredGlobal);
                videoElem.currentTime = 0;
                setSeekGuard(false);
                setLoading(false);
                setShowCanvas(false);

                // Re-fetch subtitles if active
                const currentSubtitleLabel = getCurrentSubtitleLabel();
                if (currentSubtitleLabel !== "Off") {
                    const track = getSubtitleTracks().find((t) => t.selected);
                    if (track) {
                        handleSubtitleSelect(track);
                    }
                }

                videoElem
                    .play()
                    .catch((err) =>
                        console.warn("play after seek failed:", err),
                    );
            };
        }
    };
}

export function cleanupSession(
    hls: Hls | null,
    sessionId: string,
    clearActivity: () => void,
    leaveWatchParty: () => void,
    isWatchPartyActive: boolean
) {
    clearActivity();

    // Leave watch party
    if (isWatchPartyActive) {
        leaveWatchParty();
    }

    if (hls) {
        hls.destroy();
    }

    if (sessionId) {
        const url = `${serverUrl}/cleanup?id=${sessionId}`;
        if (navigator.sendBeacon) {
            navigator.sendBeacon(url);
        } else {
            fetch(url, { method: "POST", keepalive: true });
        }
    }
}

export function detachLocalPlayback(
    hls: Hls | null,
    videoElem: HTMLVideoElement | null,
) {
    if (hls) {
        hls.destroy();
    }
    if (videoElem) {
        try {
            videoElem.pause();
        } catch {
            // ignore
        }
        videoElem.removeAttribute("src");
        try {
            videoElem.load();
        } catch {
            // ignore
        }
    }
}

export async function handleAudioSelect(
    track: Track,
    audioTracks: Track[],
    sessionId: string,
    hls: Hls | null,
    currentTime: number,
    videoElem: HTMLVideoElement,
    initHLSFn: (sessionId: string, time: number) => void,
    setStates: {
        setAudioTracks: (tracks: Track[]) => void;
        setCurrentAudioLabel: (label: string) => void;
        setLoading?: (loading: boolean) => void;
        setLoadingStage?: (stage: string) => void;
    }
) {
    const { setAudioTracks, setCurrentAudioLabel, setLoading, setLoadingStage } = setStates;

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

        await fetch(`${serverUrl}/sessions/${sessionId}/audio`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ index: track.id }),
        });

        const time = currentTime;
        if (hls) {
            hls.destroy();
        }
        initHLSFn(sessionId, time);
    } catch (err) {
        console.error("Failed to switch audio:", err);
        if (setLoading) setLoading(false);
        if (setLoadingStage) setLoadingStage("");
    }
}
