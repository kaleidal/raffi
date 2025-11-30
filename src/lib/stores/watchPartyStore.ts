import { writable, derived, get } from 'svelte/store';
import { supabase } from '../db/supabase';
import { getCachedUser } from './authStore';
import type { RealtimeChannel } from '@supabase/supabase-js';

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

interface WatchPartyUpdate {
    party_id: string;
    current_time_seconds: number;
    is_playing: boolean;
    last_update: string;
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

export const watchParty = derived(watchPartyState, $state => $state);

let realtimeChannel: RealtimeChannel | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
type SyncCallback = (currentTime: number, isPlaying: boolean) => void;
let syncCallback: SyncCallback | null = null;
type PartyEndCallback = (reason: 'host_left' | 'party_deleted') => void;
let partyEndCallback: PartyEndCallback | null = null;

export function setSyncCallback(callback: SyncCallback | null) {
    syncCallback = callback;
}

export function setPartyEndCallback(callback: PartyEndCallback | null) {
    partyEndCallback = callback;
}

function subscribeToParty(partyId: string) {
    if (realtimeChannel) {
        realtimeChannel.unsubscribe();
        realtimeChannel = null;
    }

    realtimeChannel = supabase
        .channel(`watch_party:${partyId}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'watch_parties',
                filter: `party_id=eq.${partyId}`,
            },
            (payload) => {
                const update = payload.new as WatchPartyUpdate;
                const state = get(watchPartyState);

                if (!state.isHost && state.partyId === update.party_id) {
                    watchPartyState.update(s => ({
                        ...s,
                        currentTimeSeconds: update.current_time_seconds,
                        isPlaying: update.is_playing,
                    }));

                    if (syncCallback) {
                        syncCallback(update.current_time_seconds, update.is_playing);
                    }
                }
            }
        )
        .on(
            'postgres_changes',
            {
                event: 'DELETE',
                schema: 'public',
                table: 'watch_parties',
                filter: `party_id=eq.${partyId}`,
            },
            () => {
                console.log('[WatchParty] Party deleted');
                if (partyEndCallback) {
                    partyEndCallback('party_deleted');
                }
            }
        )
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'watch_party_members',
                filter: `party_id=eq.${partyId}`,
            },
            async () => {
                const { count } = await supabase
                    .from('watch_party_members')
                    .select('*', { count: 'exact', head: true })
                    .eq('party_id', partyId);

                const state = get(watchPartyState);
                console.log('[WatchParty] Member count update:', count);

                if (!state.isHost && count === 0) {
                    console.log('[WatchParty] Host appears to have left');
                    if (partyEndCallback) {
                        partyEndCallback('host_left');
                    }
                    return;
                }

                watchPartyState.update(s => ({ ...s, memberCount: count || 0 }));
            }
        )
        .subscribe();

    console.log('[WatchParty] Subscribed to party:', partyId);
}

function startHeartbeat(partyId: string) {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }

    heartbeatInterval = setInterval(async () => {
        const user = getCachedUser();
        if (!user) return;

        try {
            await supabase
                .from('watch_party_members')
                .update({ last_seen: new Date().toISOString() })
                .eq('party_id', partyId)
                .eq('user_id', user.id);
        } catch (err) {
            console.error('[WatchParty] Heartbeat failed:', err);
        }
    }, 10000); // Every 10 seconds
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

export async function createWatchParty(
    imdbId: string,
    streamSource: string,
    season: number | null = null,
    episode: number | null = null,
    fileIdx: number | null = null
): Promise<string> {
    const user = getCachedUser();
    if (!user) throw new Error('Not authenticated');

    try {
        const { data, error } = await supabase
            .from('watch_parties')
            .insert({
                host_user_id: user.id,
                imdb_id: imdbId,
                season,
                episode,
                stream_source: streamSource,
                file_idx: fileIdx,
            })
            .select()
            .single();

        if (error) throw error;

        const partyId = data.party_id;

        await supabase
            .from('watch_party_members')
            .insert({
                party_id: partyId,
                user_id: user.id,
            });

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

        subscribeToParty(partyId);
        startHeartbeat(partyId);

        console.log('[WatchParty] Created party:', partyId);
        return partyId;
    } catch (err) {
        console.error('[WatchParty] Failed to create party:', err);
        throw err;
    }
}

export async function joinWatchParty(partyId: string): Promise<void> {
    const user = getCachedUser();
    if (!user) throw new Error('Not authenticated');

    try {
        const { data: party, error: partyError } = await supabase
            .from('watch_parties')
            .select('*')
            .eq('party_id', partyId)
            .single();

        if (partyError) throw partyError;
        if (!party) throw new Error('Party not found');

        if (new Date(party.expires_at) < new Date()) {
            throw new Error('Party has expired');
        }
        const { error: joinError } = await supabase
            .from('watch_party_members')
            .insert({
                party_id: partyId,
                user_id: user.id,
            });

        if (joinError) {
            if (joinError.code !== '23505') {
                throw joinError;
            }
        }

        const { count } = await supabase
            .from('watch_party_members')
            .select('*', { count: 'exact', head: true })
            .eq('party_id', partyId);

        watchPartyState.set({
            partyId,
            isHost: party.host_user_id === user.id,
            isActive: true,
            currentTimeSeconds: party.current_time_seconds || 0,
            isPlaying: party.is_playing || false,
            memberCount: count || 1,
            imdbId: party.imdb_id,
            season: party.season,
            episode: party.episode,
        });

        subscribeToParty(partyId);
        startHeartbeat(partyId);

        console.log('[WatchParty] Joined party:', partyId);
    } catch (err) {
        console.error('[WatchParty] Failed to join party:', err);
        throw err;
    }
}

export async function leaveWatchParty(): Promise<void> {
    const user = getCachedUser();
    if (!user) return;

    const state = get(watchPartyState);
    if (!state.partyId) return;

    try {
        await supabase
            .from('watch_party_members')
            .delete()
            .eq('party_id', state.partyId)
            .eq('user_id', user.id);

        if (state.isHost) {
            await supabase
                .from('watch_parties')
                .delete()
                .eq('party_id', state.partyId);
        }

        console.log('[WatchParty] Left party:', state.partyId);
    } catch (err) {
        console.error('[WatchParty] Failed to leave party:', err);
    } finally {
        if (realtimeChannel) {
            realtimeChannel.unsubscribe();
            realtimeChannel = null;
        }
        stopHeartbeat();
        watchPartyState.set(initialState);
    }
}

export async function updatePlaybackState(
    currentTime: number,
    isPlaying: boolean
): Promise<void> {
    const state = get(watchPartyState);
    if (!state.isHost || !state.partyId) return;

    try {
        await supabase
            .from('watch_parties')
            .update({
                current_time_seconds: currentTime,
                is_playing: isPlaying,
                last_update: new Date().toISOString(),
            })
            .eq('party_id', state.partyId);

        watchPartyState.update(s => ({
            ...s,
            currentTimeSeconds: currentTime,
            isPlaying,
        }));
    } catch (err) {
        console.error('[WatchParty] Failed to update playback state:', err);
    }
}

export async function getWatchPartyInfo(partyId: string) {
    try {
        const { data: party, error: partyError } = await supabase
            .from('watch_parties')
            .select('*')
            .eq('party_id', partyId)
            .single();

        if (partyError) throw partyError;

        const { count } = await supabase
            .from('watch_party_members')
            .select('*', { count: 'exact', head: true })
            .eq('party_id', partyId);

        return {
            ...party,
            memberCount: count || 0,
        };
    } catch (err) {
        console.error('[WatchParty] Failed to get party info:', err);
        throw err;
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
        void leaveWatchParty();
    });
}
