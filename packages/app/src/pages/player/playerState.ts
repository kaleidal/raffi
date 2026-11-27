// Player state management using Svelte stores
import { writable } from "svelte/store";
import type { Chapter, SeekFeedback } from "./types";

// Playback state
export const isPlaying = writable(false);
export const loading = writable(true);
export const loadingStage = writable("Loading...");
export const loadingDetails = writable("");
export const loadingProgress = writable<number | null>(null);
export const playbackBuffering = writable(false);
export const showCanvas = writable(false);
export const hasStarted = writable(false);

// Time and duration
export const currentTime = writable(0);
export const duration = writable(0);

// Volume and controls
export const volume = writable(1);
export const controlsVisible = writable(true);

// Chapter state
export const currentChapter = writable<Chapter | null>(null);
export const showSkipIntro = writable(false);
export const showNextEpisode = writable(false);

// Track state
export const audioTracks = writable<any[]>([]);
export const subtitleTracks = writable<any[]>([]);

// UI state
export const seekFeedback = writable<SeekFeedback | null>(null);

// First-play guidance

// Error state
export const showError = writable(false);
export const errorMessage = writable("");
export const errorDetails = writable("");

// Session state
export const sessionData = writable<any>(null);

// Object fit

// Seeking state
export const pendingSeek = writable<number | null>(null);
export const seekGuard = writable(false);
export const firstSeekLoad = writable(false);

export function resetPlayerState() {
    isPlaying.set(false);
    loading.set(true);
    loadingStage.set("Loading...");
    loadingDetails.set("");
    loadingProgress.set(null);
    playbackBuffering.set(false);
    showCanvas.set(false);
    hasStarted.set(false);
    currentTime.set(0);
    duration.set(0);
    volume.set(1);
    controlsVisible.set(true);
    currentChapter.set(null);
    showSkipIntro.set(false);
    showNextEpisode.set(false);
    audioTracks.set([]);
    subtitleTracks.set([]);
    seekFeedback.set(null);
    showError.set(false);
    errorMessage.set("");
    errorDetails.set("");
    sessionData.set(null);
    pendingSeek.set(null);
    seekGuard.set(false);
    firstSeekLoad.set(false);
}
