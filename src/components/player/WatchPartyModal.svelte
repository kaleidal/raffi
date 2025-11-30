<script lang="ts">
    import {
        watchParty,
        createWatchParty as createParty,
        joinWatchParty as joinParty,
        leaveWatchParty,
    } from "../../lib/stores/watchPartyStore";

    export let onClose: () => void;
    export let onPartyCreated: (partyId: string) => void = () => {};
    export let imdbId: string = "";
    export let season: number | null = null;
    export let episode: number | null = null;
    export let streamSource: string = "";
    export let fileIdx: number | null = null;

    let activeTab: "create" | "join" = "create";
    let partyIdInput = "";
    let createdPartyId = "";
    let loading = false;
    let error = "";
    let showCopied = false;

    async function handleCreateParty() {
        if (!imdbId || !streamSource) {
            error = "Missing content information";
            return;
        }

        loading = true;
        error = "";

        try {
            const partyId = await createParty(
                imdbId,
                streamSource,
                season,
                episode,
                fileIdx,
            );
            createdPartyId = partyId;
            onPartyCreated(partyId);
        } catch (err: any) {
            console.error("Failed to create party:", err);
            error = err.message || "Failed to create watch party";
        } finally {
            loading = false;
        }
    }

    async function handleJoinParty() {
        if (!partyIdInput.trim()) {
            error = "Please enter a party ID";
            return;
        }

        loading = true;
        error = "";

        try {
            await joinParty(partyIdInput.trim());
            onPartyCreated(partyIdInput.trim());
            onClose();
        } catch (err: any) {
            console.error("Failed to join party:", err);
            error = err.message || "Failed to join watch party";
        } finally {
            loading = false;
        }
    }

    function copyPartyId() {
        if (!createdPartyId) return;

        navigator.clipboard.writeText(createdPartyId);
        showCopied = true;
        setTimeout(() => {
            showCopied = false;
        }, 2000);
    }
</script>

<div
    class="modal-backdrop"
    onclick={onClose}
    onkeydown={(e) => e.key === "Escape" && onClose()}
    role="button"
    tabindex="0"
>
    <div
        class="modal"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
        role="dialog"
        tabindex="-1"
    >
        <div class="modal-header">
            <h2>Watch Party</h2>
            <button class="close-btn" onclick={onClose} aria-label="Close"
                >✕</button
            >
        </div>

        <div class="tabs">
            <button
                class="tab"
                class:active={activeTab === "create"}
                onclick={() => {
                    activeTab = "create";
                    error = "";
                }}
            >
                Create Party
            </button>
            <button
                class="tab"
                class:active={activeTab === "join"}
                onclick={() => {
                    activeTab = "join";
                    error = "";
                    createdPartyId = "";
                }}
            >
                Join Party
            </button>
        </div>

        <div class="modal-body">
            {#if error}
                <div class="error-message">{error}</div>
            {/if}

            {#if activeTab === "create"}
                {#if createdPartyId}
                    <div class="success-state">
                        <div class="success-icon">🎉</div>
                        <h3>Watch Party Created!</h3>
                        <p>Share this ID with friends to watch together:</p>
                        <div class="party-id-display">
                            <code>{createdPartyId}</code>
                            <button class="copy-btn" onclick={copyPartyId}>
                                {showCopied ? "✓ Copied" : "📋 Copy"}
                            </button>
                        </div>
                        <p class="info-text">
                            You're now the host. Your playback controls will
                            sync with all participants.
                        </p>
                        <button class="primary-btn" onclick={onClose}
                            >Start Watching</button
                        >
                    </div>
                {:else}
                    <div class="create-form">
                        <p>
                            Create a watch party to watch together with friends.
                            You'll be the host and control playback for
                            everyone.
                        </p>
                        <button
                            class="primary-btn"
                            onclick={handleCreateParty}
                            disabled={loading}
                        >
                            {loading ? "Creating..." : "Create Watch Party"}
                        </button>
                    </div>
                {/if}
            {:else}
                <div class="join-form">
                    <p>Enter a party ID to join an existing watch party:</p>
                    <input
                        type="text"
                        bind:value={partyIdInput}
                        placeholder="Enter party ID..."
                        class="party-input"
                        disabled={loading}
                    />
                    <button
                        class="primary-btn"
                        onclick={handleJoinParty}
                        disabled={loading || !partyIdInput.trim()}
                    >
                        {loading ? "Joining..." : "Join Party"}
                    </button>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }

    .modal {
        background: #1a1a1a;
        border-radius: 12px;
        width: 90%;
        max-width: 500px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        overflow: hidden;
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 24px;
        border-bottom: 1px solid #333;
    }

    .modal-header h2 {
        margin: 0;
        font-size: 1.5rem;
        color: #fff;
    }

    .close-btn {
        background: none;
        border: none;
        color: #aaa;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: all 0.2s;
    }

    .close-btn:hover {
        background: #333;
        color: #fff;
    }

    .tabs {
        display: flex;
        border-bottom: 1px solid #333;
    }

    .tab {
        flex: 1;
        padding: 12px 16px;
        background: none;
        border: none;
        color: #aaa;
        cursor: pointer;
        font-size: 0.95rem;
        transition: all 0.2s;
        position: relative;
    }

    .tab:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.05);
    }

    .tab.active {
        color: #fff;
    }

    .tab.active::after {
        content: "";
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: #3b82f6;
    }

    .modal-body {
        padding: 24px;
    }

    .error-message {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: #fca5a5;
        padding: 12px 16px;
        border-radius: 8px;
        margin-bottom: 20px;
        font-size: 0.9rem;
    }

    .create-form,
    .join-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .create-form p,
    .join-form p {
        color: #aaa;
        margin: 0;
        font-size: 0.95rem;
        line-height: 1.5;
    }

    .party-input {
        background: #252525;
        border: 1px solid #444;
        color: #fff;
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 0.95rem;
        font-family: monospace;
        transition: all 0.2s;
    }

    .party-input:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .party-input:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .primary-btn {
        background: #3b82f6;
        color: #fff;
        border: none;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 1rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
    }

    .primary-btn:hover:not(:disabled) {
        background: #2563eb;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    }

    .primary-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .success-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        text-align: center;
    }

    .success-icon {
        font-size: 3rem;
    }

    .success-state h3 {
        margin: 0;
        color: #fff;
        font-size: 1.25rem;
    }

    .success-state p {
        color: #aaa;
        margin: 0;
        font-size: 0.95rem;
    }

    .party-id-display {
        display: flex;
        align-items: center;
        gap: 12px;
        background: #252525;
        padding: 12px 16px;
        border-radius: 8px;
        border: 1px solid #444;
        width: 100%;
    }

    .party-id-display code {
        flex: 1;
        color: #3b82f6;
        font-size: 1rem;
        font-family: monospace;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .copy-btn {
        background: #333;
        border: none;
        color: #fff;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
    }

    .copy-btn:hover {
        background: #444;
    }

    .info-text {
        font-size: 0.85rem !important;
        color: #888 !important;
    }
</style>
