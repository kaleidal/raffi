// Subtitle handling and parsing
import { getAddons } from "../../lib/db/db";
import type { ShowResponse } from "../../lib/library/types/meta_types";
import type { Track, ParsedCue } from "./types";

let currentSubtitleAbort: AbortController | null = null;
let parsedCues: ParsedCue[] = [];

const SUBTITLE_DELAY_STORAGE_KEY = "raffi.subtitleDelaySeconds";

let subtitleDelaySeconds = (() => {
    try {
        const raw = localStorage.getItem(SUBTITLE_DELAY_STORAGE_KEY);
        if (raw == null) return 0;
        const n = Number(raw);
        return Number.isFinite(n) ? n : 0;
    } catch {
        return 0;
    }
})();

export function getSubtitleDelaySeconds() {
    return subtitleDelaySeconds;
}

export function setSubtitleDelaySeconds(seconds: number) {
    subtitleDelaySeconds = Number.isFinite(seconds) ? seconds : 0;
    try {
        localStorage.setItem(
            SUBTITLE_DELAY_STORAGE_KEY,
            String(subtitleDelaySeconds),
        );
    } catch {
        // ignore
    }
}

export function parseVTTTime(timeStr: string): number | null {
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

export function parseSRTTime(timeStr: string): number | null {
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

export function parseAndAddCue(track: TextTrack, block: string, getCurrentCueLine: () => number) {
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

    if (start !== null && end !== null) {
        parsedCues.push({ start, end, text });

        try {
            const cleanText = text.replace(/<[^>]+>/g, "");

            const cue = new VTTCue(
                start + subtitleDelaySeconds,
                end + subtitleDelaySeconds,
                cleanText,
            );

            cue.snapToLines = false;
            cue.lineAlign = "end";
            cue.line = getCurrentCueLine();

            track.addCue(cue);
        } catch (e) {
            console.warn("Failed to add cue:", e);
        }
    }
}

export function parseAndAddSRTCue(
    track: TextTrack,
    block: string,
    offset: number = 0,
    getCurrentCueLine: () => number
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
        const adjustedStart = start - offset + subtitleDelaySeconds;
        const adjustedEnd = end - offset + subtitleDelaySeconds;

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
            cue.snapToLines = false;
            cue.lineAlign = "end";
            cue.line = getCurrentCueLine();
            track.addCue(cue);
        } catch (e) {
            console.warn("Failed to add SRT cue:", e);
        }
    } else {
        console.warn("Failed to parse SRT timing:", timing);
    }
}

export async function handleSubtitleSelect(
    track: Track,
    videoElem: HTMLVideoElement | null,
    currentTime: number,
    playbackOffset: number,
    getCurrentCueLine: () => number
) {
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

            if (track.format === "srt") {
                isSrt = true;
            }

            if (track.isAddon || track.isLocal || track.url.startsWith("blob:")) {
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
                        parseAndAddSRTCue(textTrack, part, playbackOffset, getCurrentCueLine);
                    } else {
                        parseAndAddCue(textTrack, part, getCurrentCueLine);
                    }
                }
            }
            if (buffer.trim()) {
                if (isSrt) {
                    parseAndAddSRTCue(textTrack, buffer, playbackOffset, getCurrentCueLine);
                } else {
                    parseAndAddCue(textTrack, buffer, getCurrentCueLine);
                }
            }
        } catch (err: any) {
            if (err.name !== "AbortError") {
                console.error("Subtitle stream error:", err);
            }
        }
    }
}

export async function fetchAddonSubtitles(
    metaData: ShowResponse | null,
    season: number | null,
    episode: number | null
): Promise<Track[]> {
    if (!metaData) return [];

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

        const newTracks: Track[] = [];
        for (const addon of subtitleAddons) {
            const url = `${addon.transport_url}/subtitles/${type}/${id}.json`;
            console.log("Fetching addon subtitles:", url);

            try {
                const res = await fetch(url);
                if (!res.ok) continue;
                const data = await res.json();

                if (data.subtitles && Array.isArray(data.subtitles)) {
                    const addonTracks = data.subtitles.map((s: any) => ({
                        id: s.id || s.url,
                        label: `${s.lang} (${addon.manifest.name || "Addon"})`,
                        lang: s.lang,
                        url: s.url,
                        selected: false,
                        isAddon: true,
                        group: "Addon",
                    }));

                    newTracks.push(...addonTracks);
                }
            } catch (err) {
                console.warn(
                    "Failed to fetch subtitles from addon:",
                    addon.transport_url,
                    err,
                );
            }
        }
        return newTracks;
    } catch (err) {
        console.error("Failed to load addons:", err);
        return [];
    }
}

export function updateCuePositions(videoElem: HTMLVideoElement | null, cueLinePercent: number) {
    const video = videoElem;
    if (!video) return;

    const linePosition = Math.max(5, Math.min(95, cueLinePercent));

    for (let i = 0; i < video.textTracks.length; i++) {
        const track = video.textTracks[i];
        if (track.mode === "showing" && track.cues) {
            for (let j = 0; j < track.cues.length; j++) {
                const cue = track.cues[j] as VTTCue;
                cue.snapToLines = false;
                cue.lineAlign = "end";
                cue.line = linePosition;
            }
        }
    }
}

export function getCurrentCueLine(controlsVisible: boolean) {
    // Back-compat fallback (prefer computeCueLinePercent in Player.svelte).
    return controlsVisible ? 78 : 92;
}

export function computeCueLinePercent(
    playerContainer: HTMLElement | null,
    controlsOverlay: HTMLElement | null,
    controlsVisible: boolean,
    marginPx: number = 14
) {
    if (!playerContainer) return controlsVisible ? 78 : 92;

    const containerRect = playerContainer.getBoundingClientRect();
    if (!containerRect.height) return controlsVisible ? 78 : 92;

    if (!controlsVisible || !controlsOverlay) {
        return 92;
    }

    const overlayRect = controlsOverlay.getBoundingClientRect();
    // Position the bottom of the cue box just above the controls overlay.
    const targetY = overlayRect.top - containerRect.top - marginPx;
    const pct = (targetY / containerRect.height) * 100;
    return Math.max(5, Math.min(95, pct));
}
