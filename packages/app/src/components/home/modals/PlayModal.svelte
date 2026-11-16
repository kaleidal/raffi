<script lang="ts">
    import { portal } from "../../common/portal";
    import { lockPageScroll } from "../../common/scrollLock";
    import { X, FileVideo, Users, Film } from "@lucide/svelte";
    import { fade, scale } from "svelte/transition";
    import { router } from "../../../lib/stores/router";
    import { getCachedMetaData } from "../../../lib/library/metaCache";
    import { cloudSyncStatus, getWatchPartyInfo } from "../../../lib/db/db";
    import { localMode } from "../../../lib/stores/authStore";
    import { isDesktopPlatform } from "../../../lib/shell/platform";

    export let onClose: () => void;

    let mode: "select" | "join" | "preview" = "select";

    let partyCode = "";
    let partyDetails: any = null;
    let loading = false;
    let error = "";





    const closeModal = () => {
        onClose();
    };

    async function onFileSelected(e: Event) {
        const target = e.target as HTMLInputElement;
        if (target.files && target.files.length > 0) {
            const file = target.files[0];
            try {
                const playableUrl = await window.electronAPI?.getPlayableFileUrl?.(file);
                if (playableUrl) {
                    router.navigate("player", {
                        videoSrc: playableUrl,
                        startTime: 0,
                        metaData: null,
                        fileIdx: null,
                        season: null,
                        episode: null,
                    });
                    onClose();
                }
            } catch (error) {
                console.error("Failed to open local file", error);
            }
        }
        target.value = "";
    }


    async function fetchPartyDetails() {
        if (!partyCode.trim()) return;
        loading = true;
        error = "";

        try {
            const data = await getWatchPartyInfo(partyCode.trim());
            if (!data) throw new Error("Party not found");

            let showName = "Unknown Show";
            let poster = "";
            
            if (data.imdb_id) {
                try {
                    const type = data.season ? "series" : "movie"; 
                    const meta = await getCachedMetaData(data.imdb_id, type);
                    if (meta) {
                        showName = meta.meta.name;
                        poster = meta.meta.poster || "";
                    }
                } catch (e) {
                    console.warn("Failed to fetch meta for party preview", e);
                }
            }

            partyDetails = {
                ...data,
                showName,
                poster,
                memberCount: data.memberCount || 0
            };
            
            mode = "preview";
        } catch (e: any) {
            console.error("Failed to fetch party", e);
            error = e.message || "Failed to find party";
        } finally {
            loading = false;
        }
    }

    function joinParty() {
        if (!partyDetails) return;

        const normalizedPartyCode = partyCode.trim();
        const inferredType = partyDetails.season ? "series" : "movie";

        router.navigate("meta", {
            imdbId: partyDetails.imdb_id || "",
            type: inferredType,
            joinPartyId: normalizedPartyCode,
            autoJoin: true,
            openStreamsPopup: true,
            partySeason: partyDetails.season ?? null,
            partyEpisode: partyDetails.episode ?? null,
        });
        onClose();
    }
</script>

    <div
        use:portal
        use:lockPageScroll
        class="raffi-modal-backdrop fixed inset-0 z-[200] bg-canvas/58 backdrop-blur-xl flex items-center justify-center"
        transition:fade={{ duration: 200 }}
        on:click|self={closeModal}
        on:keydown={(e) => e.key === "Escape" && closeModal()}
        on:wheel|preventDefault|stopPropagation
        role="button"
        tabindex="0"
    >

    <input
        type="file"
        id="local-file-input"
        accept="video/*,.mkv,.mp4,.avi,.mov,.webm"
        class="hidden"
        on:change={onFileSelected}
    />

    <div
        class="raffi-modal-surface w-full max-w-lg rounded-[32px] bg-raised/58 backdrop-blur-[40px] p-6 md:p-8 flex flex-col gap-6 relative overflow-y-auto shadow-[0_40px_160px_rgba(0,0,0,0.45)] cursor-default"
        transition:scale={{ start: 0.95, duration: 200 }}
        on:click|stopPropagation
        on:keydown|stopPropagation
        on:wheel|stopPropagation
        role="dialog"
        tabindex="-1"
    >
        <!-- Header -->
        <div class="relative z-10 flex flex-row items-center justify-between shrink-0">
            <div>
                <h2 class="text-ink text-2xl font-bold">
                    {#if mode === "select"}
                        Play
                    {:else if mode === "join"}
                        Join Party
                    {:else}
                        Party Preview
                    {/if}
                </h2>
            </div>
            <button
                class="text-ink/50 hover:text-ink cursor-pointer transition-colors"
                on:click={onClose}
                aria-label="Close"
            >
                <X size={32} strokeWidth={2} />
            </button>
        </div>

        <!-- Content -->
        <div class="relative z-10 flex-1 overflow-y-auto">
            {#if mode === "select"}
                <div class="flex flex-col gap-4">
                    {#if isDesktopPlatform}
                        <label
                            for="local-file-input"
                            class="bg-ink/5 hover:bg-ink/10 text-ink p-4 rounded-2xl flex items-center gap-4 transition-colors text-left group cursor-pointer"
                        >
                            <div class="bg-ink/10 p-3 rounded-full group-hover:bg-ink/20 transition-colors">
                                <FileVideo size={24} strokeWidth={2} />
                            </div>
                            <div class="flex flex-col gap-1">
                                <span class="font-bold text-lg">Local File</span>
                                <span class="text-ink/55 text-sm">Play a video file from your computer</span>
                            </div>
                        </label>
                    {/if}


                    {#if !$localMode && $cloudSyncStatus.cloudFeaturesAvailable}
                        <button
                            class="bg-ink/5 hover:bg-ink/10 text-ink p-4 rounded-2xl flex items-center gap-4 transition-colors text-left group cursor-pointer"
                            on:click={() => mode = "join"}
                        >
                            <div class="bg-ink/10 p-3 rounded-full group-hover:bg-ink/20 transition-colors">
                                <Users size={24} strokeWidth={2} />
                            </div>
                            <div class="flex flex-col gap-1">
                                <span class="font-bold text-lg">Join Watch Party</span>
                                <span class="text-ink/55 text-sm">Enter a code to join friends</span>
                            </div>
                        </button>
                    {/if}

                </div>

            {:else if mode === "join" && !$localMode && $cloudSyncStatus.cloudFeaturesAvailable}
                <div class="flex flex-col gap-4">

                    <div>
                        <label for="party-code" class="block text-sm font-medium text-ink/55 mb-2">Party Code</label>
                        <input
                            id="party-code"
                            type="text"
                            placeholder="Enter code..."
                            bind:value={partyCode}
                            class="w-full bg-surface border border-ink/10 rounded-xl px-4 py-3 text-ink placeholder-ink/55 focus:outline-none focus:border-ink/30 font-mono text-center text-lg tracking-widest uppercase transition-colors"
                            on:keydown={(e) => e.key === "Enter" && fetchPartyDetails()}
                        />
                    </div>
                    
                    {#if error}
                        <div class="p-3 bg-danger/10 border border-danger/20 rounded-lg text-danger text-sm text-center">
                            {error}
                        </div>
                    {/if}

                    <div class="flex gap-3 mt-2">
                        <button
                            class="flex-1 py-3 bg-ink/10 hover:bg-ink/20 text-ink rounded-xl font-medium transition-colors"
                            on:click={() => {
                                mode = "select";
                                error = "";
                                partyCode = "";
                            }}
                        >
                            Back
                        </button>
                        <button
                            class="flex-1 py-3 bg-accent text-on-accent font-bold rounded-xl hover:bg-accent/85 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            disabled={!partyCode.trim() || loading}
                            on:click={fetchPartyDetails}
                        >
                            {#if loading}
                                <div class="w-4 h-4 border-2 border-on-accent/30 border-t-on-accent rounded-full animate-spin"></div>
                                Checking...
                            {:else}
                                Next
                            {/if}
                        </button>
                    </div>
                </div>

            {:else if mode === "preview"}
                <div class="flex flex-col gap-6 items-center">
                    {#if partyDetails.poster}
                        <img 
                            src={partyDetails.poster} 
                            alt={partyDetails.showName}
                            class="w-[120px] h-[180px] object-cover rounded-lg shadow-lg"
                        />
                    {:else}
                        <div class="w-[120px] h-[180px] bg-ink/5 rounded-lg flex items-center justify-center border border-ink/10">
                            <Film size={48} strokeWidth={1} class="text-ink/55" />
                        </div>
                    {/if}

                    <div class="flex flex-col items-center gap-1 text-center">
                        <h3 class="text-xl font-bold text-ink">{partyDetails.showName}</h3>
                        {#if partyDetails.season && partyDetails.episode}
                            <p class="text-ink/55">Season {partyDetails.season}, Episode {partyDetails.episode}</p>
                        {/if}
                        <div class="flex items-center gap-2 mt-2 bg-ink/5 px-3 py-1 rounded-full border border-ink/10">
                            <div class="w-2 h-2 rounded-full bg-success"></div>
                            <span class="text-sm text-ink/55">{partyDetails.memberCount} online</span>
                        </div>
                    </div>

                    <div class="flex gap-3 w-full">
                        <button
                            class="flex-1 py-3 bg-ink/10 hover:bg-ink/20 text-ink rounded-xl font-medium transition-colors"
                            on:click={() => mode = "join"}
                        >
                            Back
                        </button>
                        <button
                            class="flex-1 py-3 bg-accent text-on-accent font-bold rounded-xl hover:bg-accent/85 transition-colors"
                            on:click={joinParty}
                        >
                            Join Party
                        </button>
                    </div>
                </div>
            {/if}
        </div>
    </div>

</div>
