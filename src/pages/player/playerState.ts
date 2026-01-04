// Player state management using Svelte stores
import { writable } from "svelte/store";
import type { Chapter, SeekFeedback } from "./types";

// Playback state
export const isPlaying = writable(false);
export const loading = writable(true);
export const loadingStage = writable("Loading...");
export const loadingDetails = writable("");
export const loadingProgress = writable<number | null>(null);
export const showCanvas = writable(false);
export const hasStarted = writable(false);

// Time and duration
export const currentTime = writable(0);
export const duration = writable(0);
export const playbackOffset = writable(0);

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
export const currentAudioLabel = writable("Default");
export const currentSubtitleLabel = writable("Off");

// UI state
export const showAudioSelection = writable(false);
export const showSubtitleSelection = writable(false);
export const seekFeedback = writable<SeekFeedback | null>(null);

// First-play guidance
export const showSeekStyleModal = writable(false);

// Error state
export const showError = writable(false);
export const errorMessage = writable("");
export const errorDetails = writable("");

// Session state
export const sessionData = writable<any>(null);

// Object fit
export const objectFit = writable<"contain" | "cover">("contain");

// Seeking state
export const pendingSeek = writable<number | null>(null);
export const seekGuard = writable(false);
export const firstSeekLoad = writable(false);

// Watch party state
export const showWatchPartyModal = writable(false);
export const showPartyEndModal = writable(false);
export const partyEndReason = writable<"host_left" | "party_deleted">("host_left");

export function resetPlayerState() {
    isPlaying.set(false);
    loading.set(true);
    loadingStage.set("Loading...");
    loadingDetails.set("");
    loadingProgress.set(null);
    showCanvas.set(false);
    hasStarted.set(false);
    currentTime.set(0);
    duration.set(0);
    playbackOffset.set(0);
    volume.set(1);
    controlsVisible.set(true);
    currentChapter.set(null);
    showSkipIntro.set(false);
    showNextEpisode.set(false);
    audioTracks.set([]);
    subtitleTracks.set([]);
    currentAudioLabel.set("Default");
    currentSubtitleLabel.set("Off");
    showAudioSelection.set(false);
    showSubtitleSelection.set(false);
    seekFeedback.set(null);
    showSeekStyleModal.set(false);
    showError.set(false);
    errorMessage.set("");
    errorDetails.set("");
    sessionData.set(null);
    objectFit.set("contain");
    pendingSeek.set(null);
    seekGuard.set(false);
    firstSeekLoad.set(false);
    showWatchPartyModal.set(false);
    showPartyEndModal.set(false);
    partyEndReason.set("host_left");
}
