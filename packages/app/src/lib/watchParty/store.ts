import { get, writable } from "svelte/store";
import {
    createWatchParty as createWatchPartyDb,
    getWatchPartyInfo as getWatchPartyInfoDb,
    joinWatchParty as joinWatchPartyDb,
    leaveWatchParty as leaveWatchPartyDb,
} from "../db/db";
import { getCachedUser } from "../stores/authStore";
import { connectToParty, type PartyConnection, type PlaybackState } from "./connection";

export interface WatchPartyState {
    partyId: string | null;
    isHost: boolean;
    isActive: boolean;
    memberCount: number;
}

const initialState: WatchPartyState = {
    partyId: null,
    isHost: false,
    isActive: false,
    memberCount: 0,
};

const state = writable<WatchPartyState>(initialState);
export const watchParty = { subscribe: state.subscribe };

/** The host's latest playback, which guests follow. */
export const hostPlayback = writable<PlaybackState | null>(null);

type PartyEndCallback = (reason: "host_left" | "party_deleted") => void;
let partyEndCallback: PartyEndCallback | null = null;
let connection: PartyConnection | null = null;

export function setPartyEndCallback(callback: PartyEndCallback | null) {
    partyEndCallback = callback;
}

const requireUser = () => {
    const user = getCachedUser();
    if (!user) throw new Error("Not authenticated");
    return user;
};

const reset = () => {
    connection?.close();
    connection = null;
    state.set(initialState);
    hostPlayback.set(null);
};

function connect(partyId: string, isHost: boolean) {
    connection?.close();
    state.set({ partyId, isHost, isActive: true, memberCount: 1 });
    connection = connectToParty(partyId, {
        onWelcome: (host, playback, members) => {
            state.update((current) => ({ ...current, isHost: host, memberCount: members }));
            if (!host) hostPlayback.set(playback);
        },
        onState: (playback) => hostPlayback.set(playback),
        onMembers: (count) => state.update((current) => ({ ...current, memberCount: count })),
        onEnded: (reason) => {
            const wasHost = get(state).isHost;
            reset();
            if (!wasHost) partyEndCallback?.(reason === "host_left" ? "host_left" : "party_deleted");
        },
        partyExists: async () => Boolean(await getWatchPartyInfoDb(partyId)),
    });
}

export async function createWatchParty(
    imdbId: string,
    streamSource: string,
    season: number | null = null,
    episode: number | null = null,
    fileIdx: number | null = null,
): Promise<string> {
    requireUser();
    const party = await createWatchPartyDb(imdbId, streamSource, season, episode, fileIdx);
    connect(party.party_id, true);
    return party.party_id;
}

export async function joinWatchParty(partyId: string): Promise<void> {
    const user = requireUser();
    await joinWatchPartyDb(partyId);
    const info = await getWatchPartyInfoDb(partyId);
    if (!info) throw new Error("Party not found");
    connect(partyId, info.host_user_id === user.id);
}

export async function leaveWatchParty(): Promise<void> {
    const { partyId } = get(state);
    if (!partyId) return;
    reset();
    await leaveWatchPartyDb(partyId).catch((err) => console.error("[WatchParty] Failed to leave party:", err));
}

export function updatePlaybackState(position: number, playing: boolean) {
    if (get(state).isHost) connection?.sendState(position, playing);
}

/** Where the host is right now, in seconds. */
export function hostPositionNow(playback: PlaybackState) {
    return connection?.positionOf(playback) ?? playback.position;
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
