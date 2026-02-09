import { writable, derived, get } from "svelte/store";
import {
    createWatchParty as createWatchPartyDb,
    joinWatchParty as joinWatchPartyDb,
    leaveWatchParty as leaveWatchPartyDb,
    updateWatchPartyState,
    getWatchPartyInfo as getWatchPartyInfoDb,
    updateMemberLastSeen,
} from "../db/db";
import { getCachedUser } from "./authStore";

export interface WatchPartyState {
    partyId: string | null;
    isHost: boolean;
    isActive: boolean;
    currentTimeSeconds: number;
    isPlaying: boolean;
    memberCount: number;
    imdbId: string | null;
    season: number | null;
    episode: number | null;
}

const initialState: WatchPartyState = {
    partyId: null,
    isHost: false,
    isActive: false,
    currentTimeSeconds: 0,
    isPlaying: false,
    memberCount: 0,
    imdbId: null,
    season: null,
    episode: null,
};

const watchPartyState = writable<WatchPartyState>(initialState);

export const watchParty = derived(watchPartyState, ($state) => $state);

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;

type SyncCallback = (currentTime: number, isPlaying: boolean) => void;
let syncCallback: SyncCallback | null = null;

type PartyEndCallback = (reason: "host_left" | "party_deleted") => void;
let partyEndCallback: PartyEndCallback | null = null;

export function setSyncCallback(callback: SyncCallback | null) {
    syncCallback = callback;
}

export function setPartyEndCallback(callback: PartyEndCallback | null) {
    partyEndCallback = callback;
}

const stopPolling = () => {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
};

const stopHeartbeat = () => {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
};

const startHeartbeat = (partyId: string) => {
    stopHeartbeat();
    heartbeatInterval = setInterval(() => {
        updateMemberLastSeen(partyId).catch(() => {
            // ignore
        });
    }, 10_000);
};

const pollPartyState = async (partyId: string) => {
    const info = await getWatchPartyInfoDb(partyId);
    if (!info) {
        if (partyEndCallback) partyEndCallback("party_deleted");
        return;
    }

    const state = get(watchPartyState);
    if (!state.isHost) {
        const changed =
            state.currentTimeSeconds !== info.current_time_seconds || state.isPlaying !== info.is_playing;
        watchPartyState.update((s) => ({
            ...s,
            currentTimeSeconds: info.current_time_seconds || 0,
            isPlaying: Boolean(info.is_playing),
            memberCount: info.memberCount || 0,
        }));
        if (changed && syncCallback) {
            syncCallback(info.current_time_seconds || 0, Boolean(info.is_playing));
        }
    } else {
        watchPartyState.update((s) => ({ ...s, memberCount: info.memberCount || 0 }));
    }
};

const startPolling = (partyId: string) => {
    stopPolling();
    pollInterval = setInterval(() => {
        pollPartyState(partyId).catch((err) => {
            console.error("[WatchParty] Poll failed:", err);
        });
    }, 3_000);
};

export async function createWatchParty(
    imdbId: string,
    streamSource: string,
    season: number | null = null,
    episode: number | null = null,
    fileIdx: number | null = null,
): Promise<string> {
    const user = getCachedUser();
    if (!user) throw new Error("Not authenticated");

    const party = await createWatchPartyDb(imdbId, streamSource, season, episode, fileIdx);
    const partyId = party.party_id;

    watchPartyState.set({
        partyId,
        isHost: true,
        isActive: true,
        currentTimeSeconds: 0,
        isPlaying: false,
        memberCount: 1,
        imdbId,
        season,
        episode,
    });

    startHeartbeat(partyId);
    startPolling(partyId);
    return partyId;
}

export async function joinWatchParty(partyId: string): Promise<void> {
    const user = getCachedUser();
    if (!user) throw new Error("Not authenticated");

    await joinWatchPartyDb(partyId);
    const info = await getWatchPartyInfoDb(partyId);
    if (!info) throw new Error("Party not found");

    watchPartyState.set({
        partyId,
        isHost: info.host_user_id === user.id,
        isActive: true,
        currentTimeSeconds: info.current_time_seconds || 0,
        isPlaying: Boolean(info.is_playing),
        memberCount: info.memberCount || 1,
        imdbId: info.imdb_id || null,
        season: info.season ?? null,
        episode: info.episode ?? null,
    });

    startHeartbeat(partyId);
    startPolling(partyId);
}

export async function leaveWatchParty(): Promise<void> {
    const state = get(watchPartyState);
    if (!state.partyId) return;

    try {
        await leaveWatchPartyDb(state.partyId);
    } catch (err) {
        console.error("[WatchParty] Failed to leave party:", err);
    } finally {
        stopHeartbeat();
        stopPolling();
        watchPartyState.set(initialState);
    }
}

export async function updatePlaybackState(currentTime: number, isPlaying: boolean): Promise<void> {
    const state = get(watchPartyState);
    if (!state.isHost || !state.partyId) return;
    try {
        await updateWatchPartyState(state.partyId, currentTime, isPlaying);
        watchPartyState.update((s) => ({
            ...s,
            currentTimeSeconds: currentTime,
            isPlaying,
        }));
    } catch (err) {
        console.error("[WatchParty] Failed to update playback state:", err);
    }
}

export async function getWatchPartyInfo(partyId: string) {
    const info = await getWatchPartyInfoDb(partyId);
    if (!info) throw new Error("Party not found");
    return info;
}

if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => {
        void leaveWatchParty();
    });
}
