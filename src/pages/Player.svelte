<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import Hls from "hls.js";
    import {
        createSession,
        getSessionUrl,
        getStreamUrl,
        serverUrl,
    } from "../lib/client";
    import type { ShowResponse } from "../lib/library/types/meta_types";
    import PlayerControls from "../components/player/PlayerControls.svelte";
    import PlayerOverlays from "../components/player/PlayerOverlays.svelte";
    import TrackSelectionModal from "../components/player/TrackSelectionModal.svelte";
    import SeekFeedback from "../components/player/SeekFeedback.svelte";
    import PlayerErrorModal from "../components/player/PlayerErrorModal.svelte";
    import { getAddons } from "../lib/db/db";

    export let videoSrc: string | null = null;
    export let fileIdx: number | null = null;
    export let metaData: ShowResponse | null = null;
    export let autoPlay: boolean = true;
    export let onClose: () => void = () => {};
    export let onNextEpisode: () => void = () => {};

    export let onProgress: (time: number, duration: number) => void = () => {};
    export let startTime: number = 0;
    export let season: number | null = null;
    export let episode: number | null = null;

    interface Chapter {
        startTime: number;
        endTime: number;
        title: string;
    }

    let videoElem: HTMLVideoElement;
    let playerContainer: HTMLDivElement;
    let canvasElem: HTMLCanvasElement;

    let isPlaying = false;
    let loading = true;
    let showCanvas = false;
    let sessionData: any = null;
    let currentChapter: Chapter | null = null;
    let showSkipIntro = false;
    let showNextEpisode = false;
    let currentTime = 0;
    let duration = 0;
    let volume = 1;
    let controlsVisible = true;
    let hideTimeout: ReturnType<typeof setTimeout> | null = null;

    let showAudioSelection = false;
    let showSubtitleSelection = false;
    let audioTracks: any[] = [];
    let subtitleTracks: any[] = [];
    let currentAudioLabel = "Default";
    let currentSubtitleLabel = "Off";

    let seekFeedback: { type: "forward" | "backward"; id: number } | null =
        null;

    let showError = false;
    let errorMessage = "";
    let errorDetails = "";

    const IDLE_DELAY = 5000;

    function resetHideTimer() {
        controlsVisible = true;
        if (hideTimeout) clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => {
            controlsVisible = false;
        }, IDLE_DELAY);
    }

    function handleMouseMove() {
        resetHideTimer();
    }

    const togglePlay = () => {
        if (!videoElem) return;
        if (videoElem.paused) {
            void videoElem.play();
        } else {
            videoElem.pause();
        }
        resetHideTimer();
    };

    let playbackOffset = 0;
    let sessionId: string;
    let hls: Hls | null = null;
    let pendingSeek: number | null = null;
    let seekGuard = false;
    let firstSeekLoad = false;

    const handleTimeUpdate = () => {
        if (!videoElem) return;
        currentTime = playbackOffset + videoElem.currentTime;
        onProgress(currentTime, duration);
        if (!seekGuard) {
            checkChapters(currentTime);
        }
    };

    const handlePlay = () => {
        isPlaying = true;
    };

    const handlePause = () => {
        isPlaying = false;
    };

    function checkChapters(time: number) {
        let inIntro = false;
        let inCredits = false;

        if (sessionData && sessionData.chapters) {
            const chapter = sessionData.chapters.find(
                (c: any) => time >= c.startTime && time < c.endTime,
            );

            if (chapter) {
                currentChapter = chapter;
                const title = chapter.title.toLowerCase();

                if (
                    title.includes("intro") ||
                    title.includes("opening") ||
                    title.includes("logo")
                ) {
                    inIntro = true;
                }

                if (title.includes("credits") || title.includes("ending")) {
                    inCredits = true;
                }
            } else {
                currentChapter = null;
            }
        }

        showSkipIntro = inIntro;

        if (inCredits && metaData?.meta.type === "series") {
            showNextEpisode = true;
        } else if (
            duration > 0 &&
            duration - time <= 45 &&
            metaData?.meta.type === "series"
        ) {
            showNextEpisode = true;
        } else {
            showNextEpisode = false;
        }
    }

    function skipChapter() {
        if (currentChapter) {
            performSeek(currentChapter.endTime + 0.1);
        }
    }

    function nextEpisode() {
        onNextEpisode();
    }

    function handleNextEpisodeClick() {
        if (duration > 0 && duration - currentTime <= 600) {
            onProgress(duration, duration);
        }
        onNextEpisode();
    }

    function isTimeBuffered(
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

    const onSeekInput = (event: Event) => {
        const remaining = Number((event.target as HTMLInputElement).value);
        const desiredGlobal = Math.max(
            0,
            Math.min(duration, duration - remaining),
        );

        pendingSeek = desiredGlobal;
    };

    const performSeek = (targetGlobal: number) => {
        if (!videoElem || duration <= 0) return;

        targetGlobal = Math.max(0, Math.min(duration, targetGlobal));

        pendingSeek = targetGlobal;
        const localTarget = targetGlobal - playbackOffset;

        if (isTimeBuffered(videoElem, localTarget)) {
            videoElem.currentTime = localTarget;
            pendingSeek = null;
        } else {
            captureFrame();
            showCanvas = true;
            videoElem.currentTime = Math.max(localTarget, 0);
        }
    };

    const onSeekChange = (event: Event) => {
        const remaining = Number((event.target as HTMLInputElement).value);
        const desiredGlobal = duration - remaining;
        performSeek(desiredGlobal);
    };

    const onVolumeChange = (event: Event) => {
        if (!videoElem) return;
        const v = Number((event.target as HTMLInputElement).value);
        volume = v;
        videoElem.volume = v;
    };

    const toggleFullscreen = async () => {
        if (!document.fullscreenElement) {
            await playerContainer?.requestFullscreen?.();
        } else {
            await document.exitFullscreen();
        }
    };

    const handleKeydown = (event: KeyboardEvent) => {
        if (event.code === "Space") {
            event.preventDefault();
            togglePlay();
        } else if (event.code === "ArrowLeft") {
            // Forward 5s (inverted)
            performSeek(currentTime + 5);
            if (seekFeedbackTimeout) clearTimeout(seekFeedbackTimeout);
            seekFeedback = { type: "forward", id: Date.now() };
            seekFeedbackTimeout = setTimeout(() => (seekFeedback = null), 500);
        } else if (event.code === "ArrowRight") {
            // Backward 5s (inverted)
            performSeek(currentTime - 5);
            if (seekFeedbackTimeout) clearTimeout(seekFeedbackTimeout);
            seekFeedback = { type: "backward", id: Date.now() };
            seekFeedbackTimeout = setTimeout(() => (seekFeedback = null), 500);
        } else if (event.code === "ArrowUp") {
            volume = Math.min(1, volume + 0.1);
            videoElem.volume = volume;
        } else if (event.code === "ArrowDown") {
            volume = Math.max(0, volume - 0.1);
            videoElem.volume = volume;
        } else if (event.code === "Escape") {
            toggleFullscreen();
        } else if (event.code === "KeyF") {
            toggleFullscreen();
        }
    };

    let currentVideoSrc: string | null = null;

    const cleanupSession = () => {
        if (hls) {
            hls.destroy();
            hls = null;
        }

        if (sessionId) {
            const url = `${serverUrl}/cleanup?id=${sessionId}`;
            if (navigator.sendBeacon) {
                navigator.sendBeacon(url);
            } else {
                fetch(url, { method: "POST", keepalive: true });
            }
            sessionId = "";
        }
    };

    const loadVideo = async (src: string) => {
        try {
            loading = true;
            showCanvas = false;
            isPlaying = false;
            showError = false;
            errorMessage = "";
            errorDetails = "";

            currentTime = 0;
            duration = 0;
            playbackOffset = 0;
            currentChapter = null;
            showSkipIntro = false;
            showNextEpisode = false;
            seekGuard = false;
            firstSeekLoad = false;
            pendingSeek = null;

            audioTracks = [];
            subtitleTracks = [];
            currentAudioLabel = "Default";
            currentSubtitleLabel = "Off";

            const kind = src.startsWith("magnet:") ? "torrent" : "http";
            if (fileIdx) {
                console.log(
                    "Creating torrent session with file index:",
                    fileIdx,
                );
                sessionId = await createSession(src, kind, startTime, fileIdx);
            } else {
                sessionId = await createSession(src, kind, startTime);
            }
            playbackOffset = startTime;

            const res = await fetch(`${serverUrl}/sessions/${sessionId}`);
            if (!res.ok) throw new Error("Failed to load session info");
            sessionData = await res.json();
            if (sessionData.chapters) {
                console.log("Loaded chapters:", sessionData.chapters);
            }
            duration = sessionData.durationSeconds || 0;

            if (sessionData.availableStreams) {
                audioTracks = sessionData.availableStreams
                    .filter((s: any) => s.type === "audio")
                    .map((s: any) => ({
                        id: s.index,
                        label: s.title || s.language || `Audio ${s.index}`,
                        selected: s.index === (sessionData.audioIndex || 0),
                        group: "Embedded",
                    }));

                subtitleTracks = [
                    { id: "off", label: "Off", selected: true, group: "None" },
                ];

                const selectedAudio = audioTracks.find((t) => t.selected);
                if (selectedAudio) currentAudioLabel = selectedAudio.label;
            }

            fetchAddonSubtitles();

            await tick();
            if (!videoElem) return;

            initHLS(sessionId, startTime);
        } catch (err) {
            console.error("Error loading video:", err);
            errorMessage = "Failed to initialize playback";
            errorDetails = err instanceof Error ? err.message : String(err);
            showError = true;
            loading = false;
        }
    };

    function handleRetry() {
        showError = false;
        errorMessage = "";
        errorDetails = "";
        if (videoSrc) {
            loadVideo(videoSrc);
        }
    }

    function handleErrorBack() {
        showError = false;
        onClose();
    }

    async function handleAudioSelect(e: CustomEvent) {
        const track = e.detail;
        if (track.selected) return;

        audioTracks = audioTracks.map((t) => ({
            ...t,
            selected: t.id === track.id,
        }));
        currentAudioLabel = track.label;

        try {
            await fetch(`${serverUrl}/sessions/${sessionId}/audio`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ index: track.id }),
            });

            const time = currentTime;
            if (hls) {
                hls.destroy();
                hls = null;
            }
            initHLS(sessionId, time);
        } catch (err) {
            console.error("Failed to switch audio:", err);
        }
    }

    let currentSubtitleAbort: AbortController | null = null;
    let parsedCues: { start: number; end: number; text: string }[] = [];

    async function handleSubtitleSelect(e: any) {
        const track = e.detail;
        subtitleTracks = subtitleTracks.map((t) => ({
            ...t,
            selected: t.id === track.id,
        }));
        currentSubtitleLabel = track.label;

        if (currentSubtitleAbort) {
            currentSubtitleAbort.abort();
            currentSubtitleAbort = null;
        }

        parsedCues = [];

        const video = videoElem;
        if (!video) return;

        const existingTracks = video.querySelectorAll("track");
        existingTracks.forEach((t) => t.remove());

        for (let i = 0; i < video.textTracks.length; i++) {
            const t = video.textTracks[i];
            if (t.mode === "showing") {
                t.mode = "disabled";
            }
        }

        if (track.id !== "off" && track.url) {
            console.log("Starting manual subtitle fetch:", track.url);
            currentSubtitleAbort = new AbortController();

            const textTrack = video.addTextTrack(
                "subtitles",
                track.label,
                track.lang || "en",
            );
            textTrack.mode = "showing";

            try {
                let response;
                let isSrt = false;

                if (track.isAddon) {
                    console.log("Fetching addon subtitle:", track.url);
                    response = await fetch(track.url, {
                        signal: currentSubtitleAbort.signal,
                    });
                    isSrt =
                        track.url.endsWith(".srt") ||
                        track.url.includes("subencoding");
                } else {
                    const startTime = currentTime || playbackOffset || 0;
                    const fetchUrl = `${track.url}?startTime=${startTime}`;
                    console.log("Fetching subtitles from:", fetchUrl);

                    response = await fetch(fetchUrl, {
                        signal: currentSubtitleAbort.signal,
                    });
                }

                if (!response.body) throw new Error("No response body");

                const reader = response.body.getReader();
                const decoder = new TextDecoder("utf-8");
                let buffer = "";

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    buffer += chunk;

                    const normalized = buffer
                        .replace(/\r\n/g, "\n")
                        .replace(/\r/g, "\n");
                    const parts = normalized.split(/\n\n+/);

                    buffer = parts.pop() || "";

                    if (buffer.length > 5000) {
                        console.warn("Subtitle buffer too large, flushing...");
                        parts.push(buffer);
                        buffer = "";
                    }

                    for (const part of parts) {
                        if (isSrt) {
                            parseAndAddSRTCue(textTrack, part, playbackOffset);
                        } else {
                            parseAndAddCue(textTrack, part);
                        }
                    }
                }
                if (buffer.trim()) {
                    if (isSrt) {
                        parseAndAddSRTCue(textTrack, buffer, playbackOffset);
                    } else {
                        parseAndAddCue(textTrack, buffer);
                    }
                }
            } catch (err: any) {
                if (err.name !== "AbortError") {
                    console.error("Subtitle stream error:", err);
                }
            }
        }
    }

    function parseAndAddCue(track: TextTrack, block: string) {
        const lines = block
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l);
        if (lines.length < 2) return;

        let timingLineIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes("-->")) {
                timingLineIdx = i;
                break;
            }
        }

        if (timingLineIdx === -1) return;

        const timing = lines[timingLineIdx];
        const text = lines.slice(timingLineIdx + 1).join("\n");

        const [startStr, endStr] = timing.split("-->").map((s) => s.trim());
        if (!startStr || !endStr) return;

        const start = parseVTTTime(startStr);
        const end = parseVTTTime(endStr);

        const SUBTITLE_DELAY = 0.2;

        if (start !== null && end !== null) {
            parsedCues.push({ start, end, text });

            try {
                const cleanText = text.replace(/<[^>]+>/g, "");

                const cue = new VTTCue(
                    start + SUBTITLE_DELAY,
                    end + SUBTITLE_DELAY,
                    cleanText,
                );

                cue.line = getCurrentCueLine();

                track.addCue(cue);
            } catch (e) {
                console.warn("Failed to add cue:", e);
            }
        }
    }

    function parseVTTTime(timeStr: string): number | null {
        const parts = timeStr.split(":");
        let seconds = 0;

        if (parts.length === 3) {
            // HH:MM:SS.mmm
            seconds += parseFloat(parts[0]) * 3600;
            seconds += parseFloat(parts[1]) * 60;
            seconds += parseFloat(parts[2]);
        } else if (parts.length === 2) {
            // MM:SS.mmm
            seconds += parseFloat(parts[0]) * 60;
            seconds += parseFloat(parts[1]);
        } else {
            return null;
        }
        return seconds;
    }

    function parseSRTTime(timeStr: string): number | null {
        const parts = timeStr.replace(",", ".").split(":");
        let seconds = 0;

        if (parts.length === 3) {
            seconds += parseFloat(parts[0]) * 3600;
            seconds += parseFloat(parts[1]) * 60;
            seconds += parseFloat(parts[2]);
        } else {
            return null;
        }
        return seconds;
    }

    function parseAndAddSRTCue(
        track: TextTrack,
        block: string,
        offset: number = 0,
    ) {
        const lines = block
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l);

        if (lines.length < 2) return;

        let timingLineIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes("-->")) {
                timingLineIdx = i;
                break;
            }
        }

        if (timingLineIdx === -1) {
            return;
        }

        const timing = lines[timingLineIdx];
        const textLines = lines.slice(timingLineIdx + 1);
        const text = textLines.join("\n");

        const [startStr, endStr] = timing.split("-->").map((s) => s.trim());
        if (!startStr || !endStr) return;

        const start = parseSRTTime(startStr);
        const end = parseSRTTime(endStr);

        if (start !== null && end !== null) {
            const adjustedStart = start - offset;
            const adjustedEnd = end - offset;

            if (adjustedEnd < 0) return;

            parsedCues.push({ start: adjustedStart, end: adjustedEnd, text });
            try {
                const cleanText = text.replace(/<[^>]*>/g, "");

                const decodedText = cleanText
                    .replace(/&nbsp;/g, " ")
                    .replace(/&amp;/g, "&")
                    .replace(/&lt;/g, "<")
                    .replace(/&gt;/g, ">");

                const cue = new VTTCue(adjustedStart, adjustedEnd, decodedText);
                cue.line = getCurrentCueLine();
                track.addCue(cue);
            } catch (e) {
                console.warn("Failed to add SRT cue:", e);
            }
        } else {
            console.warn("Failed to parse SRT timing:", timing);
        }
    }

    async function fetchAddonSubtitles() {
        if (!metaData) return;

        try {
            const addons = await getAddons();
            const subtitleAddons = addons.filter(
                (a) =>
                    a.manifest.resources?.includes("subtitles") ||
                    a.manifest.resources?.some(
                        (r: any) => r.name === "subtitles",
                    ),
            );

            let type = metaData.meta.type;
            let id = metaData.meta.imdb_id;

            if (type === "series" && season && episode) {
                id = `${id}:${season}:${episode}`;
            }

            for (const addon of subtitleAddons) {
                const url = `${addon.transport_url}/subtitles/${type}/${id}.json`;
                console.log("Fetching addon subtitles:", url);

                try {
                    const res = await fetch(url);
                    if (!res.ok) continue;
                    const data = await res.json();

                    if (data.subtitles && Array.isArray(data.subtitles)) {
                        const newTracks = data.subtitles.map((s: any) => ({
                            id: s.id || s.url,
                            label: `${s.lang} (${addon.manifest.name || "Addon"})`,
                            lang: s.lang,
                            url: s.url,
                            selected: false,
                            isAddon: true,
                        }));

                        subtitleTracks = [...subtitleTracks, ...newTracks];
                    }
                } catch (err) {
                    console.warn(
                        "Failed to fetch subtitles from addon:",
                        addon.transport_url,
                        err,
                    );
                }
            }
        } catch (err) {
            console.error("Failed to load addons:", err);
        }
    }

    function initHLS(sid: string, startOffset: number) {
        let baseManifest = `${getStreamUrl(sid)}/child.m3u8`;
        playbackOffset = startOffset;

        if (Hls.isSupported()) {
            hls = new Hls({
                lowLatencyMode: false,
                maxBufferLength: 30,
                backBufferLength: 30,
                xhrSetup: (xhr, url) => {
                    if (url.includes("seek=") && !firstSeekLoad) {
                        const cleanUrl = url.split("?")[0];
                        xhr.open("GET", cleanUrl, true);
                    } else if (url.includes("seek=")) {
                        firstSeekLoad = false;
                    }
                },
            });

            const onInitialParsed = () => {
                hls?.off(Hls.Events.MANIFEST_PARSED, onInitialParsed);
                console.log("HLS MANIFEST_PARSED (initial)");
                loading = false;
                showCanvas = false;
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
                            playbackOffset = val;
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

            hls.on(Hls.Events.ERROR, (_, data) => {
                console.error("HLS ERROR", data);
                if (data.fatal) {
                    seekGuard = false;
                    // Show error modal for fatal errors
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        errorMessage = "Network error loading stream";
                        errorDetails = data.details || "";
                    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        errorMessage = "Media playback error";
                        errorDetails = data.details || "";
                    } else {
                        errorMessage = "Failed to load stream";
                        errorDetails = data.details || "";
                    }
                    showError = true;
                    loading = false;
                }
            });

            hls.loadSource(baseManifest);
            hls.attachMedia(videoElem);
        } else if (videoElem.canPlayType("application/vnd.apple.mpegurl")) {
            videoElem.src = baseManifest;
            videoElem.addEventListener("loadedmetadata", () => {
                if (autoPlay) {
                    videoElem.play().catch((err) => {
                        console.warn("autoplay failed:", err);
                    });
                }
            });
        } else {
            console.error("No HLS support");
        }

        const onSeeking = () => {
            if (!videoElem) return;
            if (pendingSeek == null || seekGuard) return;

            const desiredGlobal = pendingSeek;
            pendingSeek = null;

            const localTarget = desiredGlobal - playbackOffset;

            if (isTimeBuffered(videoElem, localTarget)) {
                videoElem.currentTime = localTarget;
                return;
            }

            seekGuard = true;
            loading = true;
            showCanvas = true;
            firstSeekLoad = true;
            const seekId = Math.random().toString(36).substring(7);
            const url = `${getStreamUrl(sid)}/child.m3u8?seek=${Math.floor(desiredGlobal)}&seek_id=${seekId}`;
            console.log("Hard seek to", desiredGlobal, "->", url);

            if (hls) {
                const onSeekParsed = () => {
                    console.log("HLS MANIFEST_PARSED (seek)");
                    playbackOffset = desiredGlobal;
                    seekGuard = false;
                    loading = false;
                    showCanvas = false;

                    // Re-fetch subtitles if active
                    if (currentSubtitleLabel !== "Off") {
                        const track = subtitleTracks.find((t) => t.selected);
                        if (track) {
                            handleSubtitleSelect({ detail: track });
                        }
                    }

                    videoElem.play().catch((err) => {
                        console.warn("play after seek failed:", err);
                    });

                    hls?.off(Hls.Events.MANIFEST_PARSED, onSeekParsed);
                };

                hls.on(Hls.Events.MANIFEST_PARSED, onSeekParsed);
                hls.loadSource(url);
                hls.startLoad(0);
            } else {
                videoElem.src = url;
                videoElem.onloadedmetadata = () => {
                    playbackOffset = desiredGlobal;
                    videoElem.currentTime = 0;
                    seekGuard = false;
                    loading = false;
                    showCanvas = false;

                    // Re-fetch subtitles if active
                    if (currentSubtitleLabel !== "Off") {
                        const track = subtitleTracks.find((t) => t.selected);
                        if (track) {
                            handleSubtitleSelect({ detail: track });
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

        videoElem.addEventListener("seeking", onSeeking);
    }

    $: if (videoSrc && videoSrc !== currentVideoSrc) {
        console.log("videoSrc changed, reloading...", videoSrc);
        currentVideoSrc = videoSrc;
        cleanupSession();
        loadVideo(videoSrc);
    }

    onDestroy(() => {
        cleanupSession();
    });

    const captureFrame = () => {
        if (!videoElem || !canvasElem) return;
        canvasElem.width = videoElem.videoWidth;
        canvasElem.height = videoElem.videoHeight;
        const ctx = canvasElem.getContext("2d");
        if (ctx) {
            ctx.drawImage(videoElem, 0, 0, canvasElem.width, canvasElem.height);
        }
    };
    $: updateCuePositions(controlsVisible);

    function updateCuePositions(showControls: boolean) {
        const video = videoElem;
        if (!video) return;

        const linePosition = showControls ? -5 : -3;

        for (let i = 0; i < video.textTracks.length; i++) {
            const track = video.textTracks[i];
            if (track.mode === "showing" && track.cues) {
                for (let j = 0; j < track.cues.length; j++) {
                    const cue = track.cues[j] as VTTCue;
                    cue.line = linePosition;
                }
            }
        }
    }

    function getCurrentCueLine() {
        return controlsVisible ? -5 : -3;
    }

    let seekFeedbackTimeout: any;
</script>

<svelte:window on:mousemove={handleMouseMove} on:keydown={handleKeydown} />

<div
    class="fixed inset-0 w-screen h-screen bg-black overflow-hidden group {controlsVisible
        ? 'cursor-default'
        : 'cursor-none'}"
    bind:this={playerContainer}
>
    <div class="w-full h-screen">
        <canvas
            bind:this={canvasElem}
            class="absolute inset-0 w-full h-full object-contain z-10 {showCanvas
                ? 'block'
                : 'hidden'}"
        ></canvas>
        <video
            bind:this={videoElem}
            crossorigin="anonymous"
            on:timeupdate={handleTimeUpdate}
            on:play={handlePlay}
            on:pause={handlePause}
            on:click={togglePlay}
            class="absolute inset-0 z-0 w-full h-full object-contain"
        >
            <track kind="captions" />
        </video>
    </div>

    {#if seekFeedback}
        <SeekFeedback type={seekFeedback.type} id={seekFeedback.id} />
    {/if}

    {#if !loading}
        <div
            class="absolute left-0 top-0 p-10 z-50 transition-all duration-300 ease-in-out transform {controlsVisible
                ? 'translate-y-0 opacity-100'
                : '-translate-y-10 opacity-0 pointer-events-none'}"
        >
            <button
                class="bg-[#000000]/20 backdrop-blur-md hover:bg-[#FFFFFF]/20 transition-colors duration-200 rounded-full p-4 cursor-pointer"
                on:click={onClose}
                aria-label="Close player"
            >
                <svg
                    width="30"
                    height="30"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M15 19L8 12L15 5"
                        stroke="white"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            </button>
        </div>

        <div
            class="absolute left-1/2 -translate-x-1/2 bottom-[50px] z-50 flex flex-col gap-[10px] transition-all duration-300 ease-in-out transform {controlsVisible
                ? 'translate-y-0 opacity-100'
                : 'translate-y-10 opacity-0 pointer-events-none'}"
        >
            <PlayerOverlays
                {showSkipIntro}
                {showNextEpisode}
                {skipChapter}
                {nextEpisode}
            />
            <PlayerControls
                {isPlaying}
                {duration}
                {currentTime}
                {volume}
                {controlsVisible}
                {loading}
                {videoSrc}
                {metaData}
                {currentAudioLabel}
                {currentSubtitleLabel}
                {togglePlay}
                {onSeekInput}
                {onSeekChange}
                {onVolumeChange}
                {toggleFullscreen}
                onNextEpisode={handleNextEpisodeClick}
                on:audioClick={() => (showAudioSelection = true)}
                on:subtitleClick={() => (showSubtitleSelection = true)}
            />
        </div>
    {/if}

    {#if showAudioSelection}
        <TrackSelectionModal
            title="Audio"
            tracks={audioTracks}
            on:select={handleAudioSelect}
            on:close={() => (showAudioSelection = false)}
        />
    {/if}

    {#if showSubtitleSelection}
        <TrackSelectionModal
            title="Subtitles"
            tracks={subtitleTracks}
            on:select={handleSubtitleSelect}
            on:close={() => (showSubtitleSelection = false)}
        />
    {/if}

    {#if loading}
        <div
            class="fixed inset-0 z-50 bg-[#000000]/10 backdrop-blur-[12px] flex items-center justify-center"
        >
            {#if metaData}
                <div class="relative z-10 flex flex-col items-center gap-8">
                    <img
                        src={metaData.meta.logo ?? ""}
                        alt="Logo"
                        class="w-[400px] object-contain animate-pulse"
                    />
                </div>
            {/if}
        </div>
    {/if}

    {#if showError}
        <PlayerErrorModal
            {errorMessage}
            {errorDetails}
            on:retry={handleRetry}
            on:back={handleErrorBack}
        />
    {/if}
</div>

<style>
    /* Hide default controls */
    video::-webkit-media-controls {
        display: none !important;
    }
    video::-webkit-media-controls-enclosure {
        display: none !important;
    }

    /* Subtitle styling */
    video::cue {
        background-color: transparent !important;
        text-shadow: 0 0 4px black;
        font-family: inherit;
    }
</style>
