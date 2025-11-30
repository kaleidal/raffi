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

// Internal store
const watchPartyState = writable<WatchPartyState>(initialState);

// Public readonly store
export const watchParty = derived(watchPartyState, $state => $state);

// Realtime channel
let realtimeChannel: RealtimeChannel | null = null;

// Heartbeat interval
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

// Callback for playback sync events (called when we need to sync video player)
type SyncCallback = (currentTime: number, isPlaying: boolean) => void;
let syncCallback: SyncCallback | null = null;

export function setSyncCallback(callback: SyncCallback | null) {
    syncCallback = callback;
}

// Subscribe to realtime updates
function subscribeToParty(partyId: string) {
    // Unsubscribe from previous channel if exists
    if (realtimeChannel) {
        realtimeChannel.unsubscribe();
        realtimeChannel = null;
    }

    // Create new channel
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

                // Only sync if we're a participant (not the host)
                if (!state.isHost && state.partyId === update.party_id) {
                    console.log('[WatchParty] Received update:', update);

                    // Update local state
                    watchPartyState.update(s => ({
                        ...s,
                        currentTimeSeconds: update.current_time_seconds,
                        isPlaying: update.is_playing,
                    }));

                    // Trigger sync callback
                    if (syncCallback) {
                        syncCallback(update.current_time_seconds, update.is_playing);
                    }
                }
            }
        )
        .subscribe();

    console.log('[WatchParty] Subscribed to party:', partyId);
}

// Start heartbeat to update last_seen
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

// Stop heartbeat
function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

// Create a new watch party (host)
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
        // Create party
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

        // Join as host
        await supabase
            .from('watch_party_members')
            .insert({
                party_id: partyId,
                user_id: user.id,
            });

        // Update local state
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

        // Subscribe to updates (to see member changes)
        subscribeToParty(partyId);
        startHeartbeat(partyId);

        console.log('[WatchParty] Created party:', partyId);
        return partyId;
    } catch (err) {
        console.error('[WatchParty] Failed to create party:', err);
        throw err;
    }
}

// Join an existing watch party (participant)
export async function joinWatchParty(partyId: string): Promise<void> {
    const user = getCachedUser();
    if (!user) throw new Error('Not authenticated');

    try {
        // Get party details
        const { data: party, error: partyError } = await supabase
            .from('watch_parties')
            .select('*')
            .eq('party_id', partyId)
            .single();

        if (partyError) throw partyError;
        if (!party) throw new Error('Party not found');

        // Check if party expired
        if (new Date(party.expires_at) < new Date()) {
            throw new Error('Party has expired');
        }

        // Join party
        const { error: joinError } = await supabase
            .from('watch_party_members')
            .insert({
                party_id: partyId,
                user_id: user.id,
            });

        if (joinError) {
            // Ignore duplicate key error (already joined)
            if (joinError.code !== '23505') {
                throw joinError;
            }
        }

        // Get member count
        const { count } = await supabase
            .from('watch_party_members')
            .select('*', { count: 'exact', head: true })
            .eq('party_id', partyId);

        // Update local state
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

        // Subscribe to updates
        subscribeToParty(partyId);
        startHeartbeat(partyId);

        console.log('[WatchParty] Joined party:', partyId);
    } catch (err) {
        console.error('[WatchParty] Failed to join party:', err);
        throw err;
    }
}

// Leave the current watch party
export async function leaveWatchParty(): Promise<void> {
    const user = getCachedUser();
    if (!user) return;

    const state = get(watchPartyState);
    if (!state.partyId) return;

    try {
        // Remove member
        await supabase
            .from('watch_party_members')
            .delete()
            .eq('party_id', state.partyId)
            .eq('user_id', user.id);

        // If host, delete the party
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
        // Clean up
        if (realtimeChannel) {
            realtimeChannel.unsubscribe();
            realtimeChannel = null;
        }
        stopHeartbeat();
        watchPartyState.set(initialState);
    }
}

// Update playback state (host only)
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

        // Update local state
        watchPartyState.update(s => ({
            ...s,
            currentTimeSeconds: currentTime,
            isPlaying,
        }));
    } catch (err) {
        console.error('[WatchParty] Failed to update playback state:', err);
    }
}

// Get party info (for UI)
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

// Cleanup on module unload
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
        void leaveWatchParty();
    });
}
