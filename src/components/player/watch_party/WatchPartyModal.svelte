<script lang="ts">
    import {
        watchParty,
        createWatchParty as createParty,
        joinWatchParty as joinParty,
        leaveWatchParty,
    } from "../../../lib/stores/watchPartyStore";
    import { fade, scale } from "svelte/transition";

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

    async function handleLeaveParty() {
        await leaveWatchParty();
        onClose();
    }

    function copyPartyId(id: string) {
        if (!id) return;

        navigator.clipboard.writeText(id);
        showCopied = true;
        setTimeout(() => {
            showCopied = false;
        }, 2000);
    }
</script>

<div
    class="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 backdrop-blur-sm"
    transition:fade={{ duration: 200 }}
    role="button"
    tabindex="0"
    onclick={onClose}
    onkeydown={(e) => e.key === "Escape" && onClose()}
>
    <div
        class="bg-[#121212] rounded-2xl w-full max-w-lg shadow-2xl"
        transition:scale={{ duration: 200, start: 0.95 }}
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
        role="dialog"
        tabindex="-1"
    >
        <!-- Header -->
        <div
            class="flex items-center justify-between p-6 border-b border-white/10"
        >
            <h2 class="text-2xl font-bold text-white">
                {$watchParty.isActive ? "Party Details" : "Watch Together"}
            </h2>
            <button
                class="p-2 text-[#878787] hover:text-white rounded-lg transition-colors cursor-pointer"
                onclick={onClose}
                aria-label="Close"
            >
                <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    class="cursor-pointer"
                >
                    <path
                        d="M18 6L6 18M6 6L18 18"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                    />
                </svg>
            </button>
        </div>

        {#if $watchParty.isActive}
            <div class="p-6 flex flex-col gap-6">
                <div class="flex flex-col items-center gap-4 text-center">
                    <div class="p-4 bg-blue-500/10 rounded-full">
                        <svg
                            width="48"
                            height="48"
                            viewBox="0 0 24 24"
                            fill="none"
                            class="text-blue-500"
                        >
                            <circle
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                stroke-width="2"
                            />
                            <path
                                d="M12 16V12M12 8H12.01"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                            />
                        </svg>
                    </div>
                    <div>
                        <h3 class="text-xl font-bold text-white mb-2">
                            Active Session
                        </h3>
                        <p class="text-[#878787]">
                            You are currently in a watch party
                        </p>
                    </div>
                </div>

                <div class="bg-[#1a1a1a] rounded-xl p-4 space-y-3">
                    <div class="flex items-center justify-between">
                        <span
                            class="text-xs text-[#878787] uppercase font-medium"
                            >Party ID</span
                        >
                        <button
                            class="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium text-white transition-colors cursor-pointer"
                            onclick={() =>
                                copyPartyId($watchParty.partyId || "")}
                        >
                            {#if showCopied}
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                >
                                    <path
                                        d="M5 13L9 17L19 7"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                    />
                                </svg>
                                Copied
                            {:else}
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                >
                                    <rect
                                        x="9"
                                        y="9"
                                        width="13"
                                        height="13"
                                        rx="2"
                                        stroke="currentColor"
                                        stroke-width="2"
                                    />
                                    <path
                                        d="M5 15H4C2.89543 15 2 14.1046 2 13V4C2 2.89543 2.89543 2 4 2H13C14.1046 2 15 2.89543 15 4V5"
                                        stroke="currentColor"
                                        stroke-width="2"
                                    />
                                </svg>
                                Copy
                            {/if}
                        </button>
                    </div>
                    <code
                        class="block text-white font-mono text-sm bg-black/40 rounded px-3 py-2 break-all"
                        >{$watchParty.partyId}</code
                    >
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div class="bg-[#1a1a1a] rounded-xl p-4">
                        <span
                            class="text-xs text-[#878787] uppercase font-medium block mb-1"
                            >Role</span
                        >
                        <span
                            class="text-white font-semibold flex items-center gap-2"
                        >
                            {#if $watchParty.isHost}
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    class="text-yellow-500"
                                >
                                    <path
                                        d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                                        fill="currentColor"
                                        stroke="currentColor"
                                        stroke-width="2"
                                    />
                                </svg>
                                Host
                            {:else}
                                Viewer
                            {/if}
                        </span>
                    </div>
                    <div class="bg-[#1a1a1a] rounded-xl p-4">
                        <span
                            class="text-xs text-[#878787] uppercase font-medium block mb-1"
                            >Members</span
                        >
                        <span class="text-white font-semibold"
                            >{$watchParty.memberCount}</span
                        >
                    </div>
                </div>

                <button
                    class="w-full py-3 px-4 bg-red-500/10 text-red-400 font-bold rounded-xl hover:bg-red-500/20 transition-colors cursor-pointer"
                    onclick={handleLeaveParty}
                >
                    Leave Party
                </button>
            </div>
        {:else}
            <!-- Tabs -->
            <div class="flex border-b border-white/10">
                <button
                    class="flex-1 py-3 px-4 text-sm font-medium transition-colors relative {activeTab ===
                    'create'
                        ? 'text-white'
                        : 'text-[#878787] hover:text-white cursor-pointer'}"
                    onclick={() => {
                        activeTab = "create";
                        error = "";
                    }}
                >
                    Create Party
                    {#if activeTab === "create"}
                        <div
                            class="absolute bottom-0 left-0 right-0 h-0.5 bg-white"
                        ></div>
                    {/if}
                </button>
                <button
                    class="flex-1 py-3 px-4 text-sm font-medium transition-colors relative {activeTab ===
                    'join'
                        ? 'text-white'
                        : 'text-[#878787] hover:text-white cursor-pointer'}"
                    onclick={() => {
                        activeTab = "join";
                        error = "";
                        createdPartyId = "";
                    }}
                >
                    Join Party
                    {#if activeTab === "join"}
                        <div
                            class="absolute bottom-0 left-0 right-0 h-0.5 bg-white"
                        ></div>
                    {/if}
                </button>
            </div>

            <!-- Content -->
            <div class="p-6">
                {#if error}
                    <div
                        class="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl"
                    >
                        <p class="text-red-400 text-sm">{error}</p>
                    </div>
                {/if}

                {#if activeTab === "create"}
                    {#if createdPartyId}
                        <div class="flex flex-col gap-6">
                            <div
                                class="flex flex-col items-center gap-4 text-center"
                            >
                                <div class="p-4 bg-green-500/10 rounded-full">
                                    <svg
                                        width="48"
                                        height="48"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        class="text-green-500"
                                    >
                                        <circle
                                            cx="12"
                                            cy="12"
                                            r="10"
                                            stroke="currentColor"
                                            stroke-width="2"
                                        />
                                        <path
                                            d="M8 12L11 15L16 9"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                        />
                                    </svg>
                                </div>
                                <div>
                                    <h3
                                        class="text-xl font-bold text-white mb-2"
                                    >
                                        Party Created!
                                    </h3>
                                    <p class="text-[#878787]">
                                        Share this ID with friends to watch
                                        together
                                    </p>
                                </div>
                            </div>

                            <div class="bg-[#1a1a1a] rounded-xl p-4 space-y-3">
                                <div class="flex items-center justify-between">
                                    <span
                                        class="text-xs text-[#878787] uppercase font-medium"
                                        >Party ID</span
                                    >
                                    <button
                                        class="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium text-white transition-colors cursor-pointer"
                                        onclick={() =>
                                            copyPartyId(createdPartyId)}
                                    >
                                        {#if showCopied}
                                            <svg
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                            >
                                                <path
                                                    d="M5 13L9 17L19 7"
                                                    stroke="currentColor"
                                                    stroke-width="2"
                                                    stroke-linecap="round"
                                                />
                                            </svg>
                                            Copied
                                        {:else}
                                            <svg
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                            >
                                                <rect
                                                    x="9"
                                                    y="9"
                                                    width="13"
                                                    height="13"
                                                    rx="2"
                                                    stroke="currentColor"
                                                    stroke-width="2"
                                                />
                                                <path
                                                    d="M5 15H4C2.89543 15 2 14.1046 2 13V4C2 2.89543 2.89543 2 4 2H13C14.1046 2 15 2.89543 15 4V5"
                                                    stroke="currentColor"
                                                    stroke-width="2"
                                                />
                                            </svg>
                                            Copy
                                        {/if}
                                    </button>
                                </div>
                                <code
                                    class="block text-white font-mono text-sm bg-black/40 rounded px-3 py-2 break-all"
                                    >{createdPartyId}</code
                                >
                            </div>

                            <div
                                class="bg-blue-500/10 rounded-xl p-4 flex gap-3 items-center"
                            >
                                <svg
                                    width="20"
                                    height="20"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    class="text-blue-400 flex-shrink-0 mt-0.5"
                                >
                                    <circle
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        stroke-width="2"
                                    />
                                    <path
                                        d="M12 16V12M12 8H12.01"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                    />
                                </svg>
                                <p class="text-sm text-blue-400">
                                    As the host, your playback controls sync
                                    with all participants
                                </p>
                            </div>

                            <button
                                class="w-full py-3 px-4 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-colors cursor-pointer"
                                onclick={onClose}
                            >
                                Start Watching
                            </button>
                        </div>
                    {:else}
                        <div class="flex flex-col gap-6">
                            <div
                                class="flex flex-col items-center gap-4 text-center py-4"
                            >
                                <svg
                                    width="64"
                                    height="64"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    class="text-[#878787]"
                                >
                                    <path
                                        d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                    />
                                    <circle
                                        cx="9"
                                        cy="7"
                                        r="4"
                                        stroke="currentColor"
                                        stroke-width="2"
                                    />
                                    <path
                                        d="M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89318 18.7122 8.75608 18.1676 9.45769C17.623 10.1593 16.8604 10.6597 16 10.88"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                    />
                                </svg>
                                <div>
                                    <h3
                                        class="text-lg font-bold text-white mb-2"
                                    >
                                        Start a Watch Party
                                    </h3>
                                    <p class="text-[#878787] text-sm">
                                        Create a synchronized viewing session
                                        and watch together in real-time
                                    </p>
                                </div>
                            </div>

                            <button
                                class="w-full py-3 px-4 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                onclick={handleCreateParty}
                                disabled={loading}
                            >
                                {loading ? "Creating..." : "Create Party"}
                            </button>
                        </div>
                    {/if}
                {:else}
                    <div class="flex flex-col gap-6">
                        <div
                            class="flex flex-col items-center gap-4 text-center py-4"
                        >
                            <svg
                                width="64"
                                height="64"
                                viewBox="0 0 20 20"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <g clip-path="url(#clip0_273_275)">
                                    <path
                                        d="M4.83317 9.41663L1.6665 18.3333L10.5832 15.175M3.33317 2.49996H3.3415M18.3332 6.66663H18.3415M12.4998 1.66663H12.5082M18.3332 16.6666H18.3415M18.3332 1.66663L16.4665 2.29163C15.9352 2.46862 15.4818 2.82466 15.1839 3.2989C14.8859 3.77313 14.762 4.33612 14.8332 4.89163C14.9165 5.60829 14.3582 6.24996 13.6248 6.24996H13.3082C12.5915 6.24996 11.9748 6.74996 11.8415 7.44996L11.6665 8.33329M18.3332 10.8333L17.6498 10.5583C16.9332 10.275 16.1332 10.725 15.9998 11.4833C15.9082 12.0666 15.3998 12.5 14.8082 12.5H14.1665M9.1665 1.66663L9.4415 2.34996C9.72484 3.06663 9.27484 3.86663 8.5165 3.99996C7.93317 4.08329 7.49984 4.59996 7.49984 5.19163V5.83329M9.1665 10.8333C10.7748 12.4416 11.5248 14.3083 10.8332 15C10.1415 15.6916 8.27484 14.9416 6.6665 13.3333C5.05817 11.725 4.30817 9.85829 4.99984 9.16663C5.6915 8.47496 7.55817 9.22496 9.1665 10.8333Z"
                                        stroke="#878787"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    />
                                </g>
                                <defs>
                                    <clipPath id="clip0_273_275">
                                        <rect
                                            width="20"
                                            height="20"
                                            fill="#878787"
                                        />
                                    </clipPath>
                                </defs>
                            </svg>

                            <div>
                                <h3 class="text-lg font-bold text-white mb-2">
                                    Join a Party
                                </h3>
                                <p class="text-[#878787] text-sm">
                                    Enter the party ID to join your friend's
                                    watch session
                                </p>
                            </div>
                        </div>

                        <input
                            type="text"
                            bind:value={partyIdInput}
                            placeholder="Enter Party ID..."
                            class="w-full px-4 py-3 bg-[#1a1a1a] border border-white/10 rounded-xl text-white placeholder-[#878787] focus:outline-none focus:border-white/30 font-mono transition-colors disabled:opacity-50"
                            disabled={loading}
                        />

                        <button
                            class="w-full py-3 px-4 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            onclick={handleJoinParty}
                            disabled={loading || !partyIdInput.trim()}
                        >
                            {loading ? "Joining..." : "Join Party"}
                        </button>
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>
