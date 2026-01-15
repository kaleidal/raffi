<script lang="ts">
    import {
        watchParty,
        createWatchParty as createParty,
        joinWatchParty as joinParty,
        leaveWatchParty,
    } from "../../../lib/stores/watchPartyStore";
    import { fade, scale } from "svelte/transition";
    import { supabase } from "../../../lib/db/supabase";
    import { onMount } from "svelte";
    import { trackEvent } from "../../../lib/analytics";


    export let onClose: () => void;
    export let onPartyCreated: (partyId: string) => void = () => {};
    export let onFileSelected: (file: any) => void = () => {};
    export let imdbId: string = "";
    export let season: number | null = null;
    export let episode: number | null = null;
    export let streamSource: string = "";
    export let fileIdx: number | null = null;
    export let initialPartyCode: string | null = null;
    export let autoJoin: boolean = false;

    let activeTab: "create" | "join" = initialPartyCode ? "join" : "create";
    let partyIdInput = initialPartyCode || "";
    let createdPartyId = "";
    let loading = false;
    let error = "";
    let showCopied = false;

    const getStreamSourceType = (src: string) => {
        if (!src) return "unknown";
        if (src.startsWith("magnet:")) return "torrent";
        if (!src.startsWith("http://") && !src.startsWith("https://")) return "local";
        return "direct";
    };

    // Join Flow State

    let joinStep: "input" | "preview" | "select-file" = "input";
    let partyPreview: any = null;
    let selectedFile: File | null = null;

    onMount(() => {
        if (initialPartyCode && autoJoin) {
            handlePreviewParty();
        }
    });

    async function handleCreateParty() {
        if (!imdbId || !streamSource) {
            error = "Missing content information";
            return;
        }

        loading = true;
        error = "";

        const sourceType = getStreamSourceType(streamSource);

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
            trackEvent("watch_party_created", {
                source_type: sourceType,
                is_local: sourceType === "local",
                is_torrent: sourceType === "torrent",
            });
        } catch (err: any) {
            console.error("Failed to create party:", err);
            error = err.message || "Failed to create watch party";
            trackEvent("watch_party_create_failed", {
                source_type: sourceType,
                error_name: err instanceof Error ? err.name : "unknown",
            });
        } finally {
            loading = false;
        }
    }


    async function handlePreviewParty() {
        if (!partyIdInput.trim()) {
            error = "Please enter a party ID";
            return;
        }

        loading = true;
        error = "";

        try {
            const { data, error: fetchError } = await supabase
                .from("watch_parties")
                .select("*, watch_party_members(count)")
                .eq("party_id", partyIdInput.trim())
                .single();

            if (fetchError) throw fetchError;
            if (!data) throw new Error("Party not found");

            partyPreview = data;
            joinStep = "preview";
            const sourceType = getStreamSourceType(data?.stream_source || "");
            trackEvent("watch_party_preview_loaded", {
                source_type: sourceType,
                is_local: sourceType === "local",
                is_torrent: sourceType === "torrent",
            });
        } catch (err: any) {
            console.error("Failed to preview party:", err);
            error = err.message || "Failed to find watch party";
            joinStep = "input";
            trackEvent("watch_party_preview_failed", {
                error_name: err instanceof Error ? err.name : "unknown",
            });
        } finally {
            loading = false;
        }
    }


    function handleContinueToJoin() {
        if (!partyPreview) return;

        // Check if the party is using a local file (heuristic: not http/https)
        const isLocal =
            partyPreview.stream_source &&
            !partyPreview.stream_source.startsWith("http");

        if (isLocal) {
            joinStep = "select-file";
        } else {
            handleFinalJoin();
        }
    }

    async function handleFinalJoin() {
        loading = true;
        error = "";

        try {
            await joinParty(partyIdInput.trim());

            if (selectedFile) {
                // Create a file object that matches what the player expects
                // The player expects a file object with a path property for Electron
                // Or just the path string if it's handled that way.
                // But the input file object from browser has 'path' property in Electron?
                // In Electron, File object has 'path' property.
                onFileSelected(selectedFile);
            }

            onPartyCreated(partyIdInput.trim());
            onClose();
            const sourceType = getStreamSourceType(partyPreview?.stream_source || "");
            trackEvent("watch_party_joined", {
                source_type: sourceType,
                is_local: sourceType === "local",
                is_torrent: sourceType === "torrent",
                used_local_file: Boolean(selectedFile),
            });
        } catch (err: any) {
            console.error("Failed to join party:", err);
            error = err.message || "Failed to join watch party";
            trackEvent("watch_party_join_failed", {
                error_name: err instanceof Error ? err.name : "unknown",
            });
        } finally {
            loading = false;
        }
    }

    async function handleLeaveParty() {
        await leaveWatchParty();
        trackEvent("watch_party_left");
        onClose();
    }

    function copyPartyId(id: string) {
        if (!id) return;

        navigator.clipboard.writeText(id);
        showCopied = true;
        trackEvent("watch_party_id_copied");
        setTimeout(() => {
            showCopied = false;
        }, 2000);
    }

    function handleFileChange(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            selectedFile = input.files[0];
            trackEvent("watch_party_local_file_selected");
        }
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
                    <div class="space-y-4" in:fade={{ duration: 200 }}>
                        {#if joinStep === "input"}
                            <div>
                                <label for="party-code" class="block text-sm font-medium text-white/60 mb-2">Party Code</label>
                                <input
                                    id="party-code"
                                    type="text"
                                    bind:value={partyIdInput}
                                    placeholder="Enter code..."
                                    class="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-primary-500 transition-colors font-mono text-center text-lg tracking-widest uppercase"
                                    onkeydown={(e) => e.key === "Enter" && handlePreviewParty()}
                                />
                            </div>

                            <button
                                class="w-full py-3 bg-white text-black rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                onclick={handlePreviewParty}
                                disabled={loading || !partyIdInput.trim()}
                            >
                                {#if loading}
                                    <div class="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                                    Checking...
                                {:else}
                                    Preview Party
                                {/if}
                            </button>
                        {:else if joinStep === "preview"}
                            <div class="text-center py-4">
                                <h3 class="text-lg font-bold text-white mb-1">Party Found!</h3>
                                <p class="text-white/60 text-sm mb-6">Ready to join?</p>

                                <div class="bg-white/5 rounded-xl p-4 mb-6 text-left">
                                    <div class="flex items-center gap-3 mb-3">
                                        <div class="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-400"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                                        </div>
                                        <div>
                                            <p class="text-white font-medium">
                                                {partyPreview?.watch_party_members[0]?.count || 0} Members
                                            </p>
                                            <p class="text-white/40 text-xs">Currently Watching</p>
                                        </div>
                                    </div>
                                    
                                    <div class="pl-13">
                                        <p class="text-white/80 text-sm break-all">
                                            {partyPreview?.stream_source}
                                        </p>
                                    </div>
                                </div>

                                <div class="flex gap-3">
                                    <button
                                        class="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-colors"
                                        onclick={() => joinStep = "input"}
                                    >
                                        Back
                                    </button>
                                    <button
                                        class="flex-1 py-3 bg-white text-black rounded-xl font-bold transition-colors"
                                        onclick={handleContinueToJoin}
                                    >
                                        Join
                                    </button>
                                </div>
                            </div>
                        {:else if joinStep === "select-file"}
                            <div class="text-center py-4">
                                <h3 class="text-lg font-bold text-white mb-1">Select File</h3>
                                <p class="text-white/60 text-sm mb-6">This party is watching a local file. Please select your copy.</p>

                                <div class="bg-white/5 rounded-xl p-6 mb-6 border-2 border-dashed border-white/10 hover:border-blue-500/50 transition-colors relative group">
                                    <input
                                        type="file"
                                        class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                        onchange={handleFileChange}
                                        accept="video/*,.mkv,.mp4,.avi,.mov"
                                    />
                                    <div class="flex flex-col items-center gap-3 pointer-events-none">
                                        <div class="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-white/40 group-hover:text-blue-400"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                                        </div>
                                        {#if selectedFile}
                                            <div class="text-center">
                                                <p class="text-white font-medium truncate max-w-[200px]">{selectedFile.name}</p>
                                                <p class="text-white/40 text-xs">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                                            </div>
                                        {:else}
                                            <p class="text-white/60 text-sm">Click or drag file here</p>
                                        {/if}
                                    </div>
                                </div>

                                <div class="flex gap-3">
                                    <button
                                        class="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-colors"
                                        onclick={() => joinStep = "preview"}
                                    >
                                        Back
                                    </button>
                                    <button
                                        class="flex-1 py-3 bg-white text-black rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        onclick={handleFinalJoin}
                                        disabled={!selectedFile || loading}
                                    >
                                        {#if loading}
                                            Joining...
                                        {:else}
                                            Start Watching
                                        {/if}
                                    </button>
                                </div>
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>
