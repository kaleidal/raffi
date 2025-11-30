<script lang="ts">
    import {
        watchParty,
        leaveWatchParty,
    } from "../../lib/stores/watchPartyStore";

    let showDetails = false;
    let syncing = false;

    // Show syncing indicator temporarily when state updates
    $: if ($watchParty.isActive && !$watchParty.isHost) {
        syncing = true;
        setTimeout(() => {
            syncing = false;
        }, 500);
    }

    async function handleLeave() {
        await leaveWatchParty();
    }
</script>

{#if $watchParty.isActive}
    <div class="overlay" class:expanded={showDetails}>
        <div class="overlay-content">
            <div class="main-info">
                <button
                    class="toggle-btn"
                    onclick={() => (showDetails = !showDetails)}
                    aria-label={showDetails ? "Hide details" : "Show details"}
                >
                    <span class="icon">👥</span>
                    <span class="member-count">{$watchParty.memberCount}</span>
                    {#if syncing && !$watchParty.isHost}
                        <span class="syncing">Syncing...</span>
                    {/if}
                </button>
            </div>

            {#if showDetails}
                <div class="details">
                    <div class="detail-row">
                        <span class="label">Role:</span>
                        <span class="value"
                            >{$watchParty.isHost
                                ? "👑 Host"
                                : "👤 Participant"}</span
                        >
                    </div>
                    <div class="detail-row">
                        <span class="label">Members:</span>
                        <span class="value">{$watchParty.memberCount}</span>
                    </div>
                    {#if $watchParty.partyId}
                        <div class="detail-row">
                            <span class="label">Party ID:</span>
                            <span class="value party-id"
                                >{$watchParty.partyId.slice(0, 8)}...</span
                            >
                        </div>
                    {/if}
                    {#if !$watchParty.isHost}
                        <div class="info-message">Host controls playback</div>
                    {/if}
                    <button class="leave-btn" onclick={handleLeave}>
                        Leave Party
                    </button>
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .overlay {
        position: absolute;
        top: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(10px);
        border-radius: 12px;
        padding: 12px;
        z-index: 100;
        transition: all 0.3s ease;
        min-width: 120px;
    }

    .overlay.expanded {
        min-width: 260px;
    }

    .overlay-content {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .main-info {
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .toggle-btn {
        background: none;
        border: none;
        color: #fff;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.95rem;
        padding: 4px 8px;
        border-radius: 6px;
        transition: background 0.2s;
    }

    .toggle-btn:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .icon {
        font-size: 1.2rem;
    }

    .member-count {
        font-weight: 600;
        color: #3b82f6;
    }

    .syncing {
        font-size: 0.8rem;
        color: #fbbf24;
        animation: pulse 1s ease-in-out infinite;
    }

    @keyframes pulse {
        0%,
        100% {
            opacity: 1;
        }
        50% {
            opacity: 0.5;
        }
    }

    .details {
        display: flex;
        flex-direction: column;
        gap: 10px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        padding-top: 12px;
    }

    .detail-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.9rem;
    }

    .label {
        color: #aaa;
    }

    .value {
        color: #fff;
        font-weight: 500;
    }

    .party-id {
        font-family: monospace;
        font-size: 0.85rem;
        color: #3b82f6;
    }

    .info-message {
        background: rgba(59, 130, 246, 0.1);
        border: 1px solid rgba(59, 130, 246, 0.3);
        color: #93c5fd;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 0.85rem;
        text-align: center;
    }

    .leave-btn {
        background: #dc2626;
        border: none;
        color: #fff;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 0.9rem;
        cursor: pointer;
        transition: all 0.2s;
        font-weight: 500;
    }

    .leave-btn:hover {
        background: #b91c1c;
        transform: translateY(-1px);
    }
</style>
