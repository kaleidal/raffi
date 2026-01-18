<script lang="ts">
    import { createEventDispatcher, onDestroy } from "svelte";
    import { X, FileVideo, Magnet, Users, Film } from "lucide-svelte";
    import { fade, scale } from "svelte/transition";
    import { router } from "../../../lib/stores/router";
    import { getCachedMetaData } from "../../../lib/library/metaCache";
    import { supabase } from "../../../lib/db/supabase";
    import { localMode } from "../../../lib/stores/authStore";

    const portal = (node: HTMLElement) => {
        if (typeof document === "undefined") {
            return { destroy() {} };
        }
        document.body.appendChild(node);
        return {
            destroy() {
                if (node.parentNode) {
                    node.parentNode.removeChild(node);
                }
            },
        };
    };

    export let onClose: () => void;


    let mode: "select" | "join" | "preview" | "magnet" = "select";
    let bodyLocked = false;

    let partyCode = "";
    let magnetLink = "";
    let partyDetails: any = null;
    let loading = false;
    let error = "";

    let fileInput: HTMLInputElement;

    const toggleBodyScroll = (active: boolean) => {
        if (typeof document === "undefined") return;
        const body = document.body;
        const html = document.documentElement;
        const container = document.querySelector(
            "[data-scroll-container]",
        ) as HTMLElement | null;
        const count = Number(body.dataset.modalCount || "0");
        if (active) {
            if (count === 0) {
                const scrollY = window.scrollY;
                body.dataset.scrollY = String(scrollY);
                body.dataset.prevOverflow = body.style.overflow || "";
                body.dataset.prevPosition = body.style.position || "";
                body.dataset.prevTop = body.style.top || "";
                body.dataset.prevWidth = body.style.width || "";
                body.style.overflow = "hidden";
                body.style.position = "fixed";
                body.style.top = `-${scrollY}px`;
                body.style.width = "100%";
                html.style.overflow = "hidden";
                if (container) {
                    container.dataset.prevOverflowY = container.style.overflowY || "";
                    container.dataset.prevOverflowX = container.style.overflowX || "";
                    container.style.overflowY = "hidden";
                    container.style.overflowX = "hidden";
                }
            }
            body.dataset.modalCount = String(count + 1);
            return;
        }
        const next = Math.max(0, count - 1);
        body.dataset.modalCount = String(next);
        if (next === 0) {
            const scrollY = Number(body.dataset.scrollY || "0");
            body.style.overflow = body.dataset.prevOverflow || "";
            body.style.position = body.dataset.prevPosition || "";
            body.style.top = body.dataset.prevTop || "";
            body.style.width = body.dataset.prevWidth || "";
            html.style.overflow = "";
            delete body.dataset.prevOverflow;
            delete body.dataset.prevPosition;
            delete body.dataset.prevTop;
            delete body.dataset.prevWidth;
            delete body.dataset.scrollY;
            if (container) {
                container.style.overflowY = container.dataset.prevOverflowY || "";
                container.style.overflowX = container.dataset.prevOverflowX || "";
                delete container.dataset.prevOverflowY;
                delete container.dataset.prevOverflowX;
            }
            window.scrollTo(0, scrollY);
        }
    };

    const updateBodyLock = (active: boolean) => {
        if (active && !bodyLocked) {
            toggleBodyScroll(true);
            bodyLocked = true;
        } else if (!active && bodyLocked) {
            toggleBodyScroll(false);
            bodyLocked = false;
        }
    };

    updateBodyLock(true);

    onDestroy(() => {
        updateBodyLock(false);
    });

    const closeModal = () => {
        onClose();
    };

    function onFileSelected(e: Event) {

        const target = e.target as HTMLInputElement;
        if (target.files && target.files.length > 0) {
            const file = target.files[0] as any;
            let filePath = file.path;

            // Try to use webUtils via preload if available (Electron 20+)
            if ((window as any).electronAPI?.getFilePath) {
                try {
                    filePath = (window as any).electronAPI.getFilePath(file);
                } catch (e) {
                    console.warn("Failed to get path via webUtils", e);
                }
            }
            
            if (filePath) {
                router.navigate("player", {
                    videoSrc: filePath,
                    startTime: 0,
                    metaData: null,
                    fileIdx: null,
                    season: null,
                    episode: null,
                });
                onClose();
            }
        }
        // Reset value so the same file can be selected again if needed
        target.value = "";
    }

    function playMagnet() {
        if (!magnetLink.trim()) return;
        router.navigate("player", {
            videoSrc: magnetLink.trim(),
            startTime: 0,
            metaData: null,
            fileIdx: null,
            season: null,
            episode: null,
        });
        onClose();
    }

    async function fetchPartyDetails() {
        if (!partyCode.trim()) return;
        loading = true;
        error = "";

        try {
            const { data, error: err } = await supabase
                .from("watch_parties")
                .select("*")
                .eq("party_id", partyCode.trim())
                .single();

            if (err) throw err;
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

            const { count } = await supabase
                .from("watch_party_members")
                .select("*", { count: "exact", head: true })
                .eq("party_id", partyCode.trim());

            partyDetails = {
                ...data,
                showName,
                poster,
                memberCount: count || 0
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
        
        router.navigate("player", {
            joinPartyId: partyCode,
            imdbId: partyDetails.imdb_id || "",
            season: partyDetails.season,
            episode: partyDetails.episode,
            autoJoin: true
        });
        onClose();
    }
</script>

    <div
        use:portal
        class="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center"
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
        bind:this={fileInput}
        on:change={onFileSelected}
    />

    <div
        class="bg-[#121212] w-full max-w-lg rounded-[32px] p-6 md:p-8 flex flex-col gap-6 relative overflow-hidden shadow-[0_40px_160px_rgba(0,0,0,0.55)] cursor-default"
        transition:scale={{ start: 0.95, duration: 200 }}
        on:click|stopPropagation
        on:keydown|stopPropagation
        on:wheel|stopPropagation
        role="dialog"
        tabindex="-1"
    >


        <!-- Header -->
        <div class="flex flex-row items-center justify-between shrink-0">
            <div>
                <h2 class="text-white text-2xl font-poppins font-bold">
                    {#if mode === "select"}
                        Play
                    {:else if mode === "join"}
                        Join Party
                    {:else if mode === "magnet"}
                        Play Magnet Link
                    {:else}
                        Party Preview
                    {/if}
                </h2>
            </div>
            <button
                class="text-white/50 hover:text-white cursor-pointer transition-colors"
                on:click={onClose}
                aria-label="Close"
            >
                <X size={32} strokeWidth={2} />
            </button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto">
            {#if mode === "select"}
                <div class="flex flex-col gap-4">
                    <label
                        for="local-file-input"
                        class="bg-white/5 hover:bg-white/10 text-white p-4 rounded-2xl flex items-center gap-4 transition-colors text-left group cursor-pointer"
                    >
                        <div class="bg-white/10 p-3 rounded-full group-hover:bg-white/20 transition-colors">
                            <FileVideo size={24} strokeWidth={2} />
                        </div>
                        <div class="flex flex-col gap-1">
                            <span class="font-bold text-lg">Local File</span>
                            <span class="text-[#878787] text-sm">Play a video file from your computer</span>
                        </div>
                    </label>

                    <button
                        class="bg-white/5 hover:bg-white/10 text-white p-4 rounded-2xl flex items-center gap-4 transition-colors text-left group cursor-pointer"
                        on:click={() => mode = "magnet"}
                    >
                        <div class="bg-white/10 p-3 rounded-full group-hover:bg-white/20 transition-colors">
                            <Magnet size={24} strokeWidth={2} />
                        </div>
                        <div class="flex flex-col gap-1">
                            <span class="font-bold text-lg">Play Magnet Link</span>
                            <span class="text-[#878787] text-sm">Stream directly from a magnet URL</span>
                        </div>
                    </button>

                    {#if !$localMode}
                        <button
                            class="bg-white/5 hover:bg-white/10 text-white p-4 rounded-2xl flex items-center gap-4 transition-colors text-left group cursor-pointer"
                            on:click={() => mode = "join"}
                        >
                            <div class="bg-white/10 p-3 rounded-full group-hover:bg-white/20 transition-colors">
                                <Users size={24} strokeWidth={2} />
                            </div>
                            <div class="flex flex-col gap-1">
                                <span class="font-bold text-lg">Join Watch Party</span>
                                <span class="text-[#878787] text-sm">Enter a code to join friends</span>
                            </div>
                        </button>
                    {/if}

                </div>

            {:else if mode === "magnet"}
                <div class="flex flex-col gap-4">
                    <div>
                        <label for="magnet-link" class="block text-sm font-medium text-[#878787] mb-2">Magnet Link</label>
                        <textarea
                            id="magnet-link"
                            placeholder="magnet:?xt=urn:btih:..."
                            bind:value={magnetLink}
                            class="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#878787] focus:outline-none focus:border-white/30 font-mono text-sm min-h-[100px] resize-none transition-colors"
                            on:keydown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), playMagnet())}
                        ></textarea>
                    </div>

                    <div class="flex gap-3 mt-2">
                        <button
                            class="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-colors"
                            on:click={() => {
                                mode = "select";
                                magnetLink = "";
                            }}
                        >
                            Back
                        </button>
                        <button
                            class="flex-1 py-3 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={!magnetLink.trim()}
                            on:click={playMagnet}
                        >
                            Play
                        </button>
                    </div>
                </div>

            {:else if mode === "join" && !$localMode}
                <div class="flex flex-col gap-4">

                    <div>
                        <label for="party-code" class="block text-sm font-medium text-[#878787] mb-2">Party Code</label>
                        <input
                            id="party-code"
                            type="text"
                            placeholder="Enter code..."
                            bind:value={partyCode}
                            class="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#878787] focus:outline-none focus:border-white/30 font-mono text-center text-lg tracking-widest uppercase transition-colors"
                            on:keydown={(e) => e.key === "Enter" && fetchPartyDetails()}
                        />
                    </div>
                    
                    {#if error}
                        <div class="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
                            {error}
                        </div>
                    {/if}

                    <div class="flex gap-3 mt-2">
                        <button
                            class="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-colors"
                            on:click={() => {
                                mode = "select";
                                error = "";
                                partyCode = "";
                            }}
                        >
                            Back
                        </button>
                        <button
                            class="flex-1 py-3 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            disabled={!partyCode.trim() || loading}
                            on:click={fetchPartyDetails}
                        >
                            {#if loading}
                                <div class="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
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
                        <div class="w-[120px] h-[180px] bg-white/5 rounded-lg flex items-center justify-center border border-white/10">
                            <Film size={48} strokeWidth={1} color="#878787" />
                        </div>
                    {/if}

                    <div class="flex flex-col items-center gap-1 text-center">
                        <h3 class="text-xl font-bold text-white">{partyDetails.showName}</h3>
                        {#if partyDetails.season && partyDetails.episode}
                            <p class="text-[#878787]">Season {partyDetails.season}, Episode {partyDetails.episode}</p>
                        {/if}
                        <div class="flex items-center gap-2 mt-2 bg-white/5 px-3 py-1 rounded-full border border-white/10">
                            <div class="w-2 h-2 rounded-full bg-green-500"></div>
                            <span class="text-sm text-[#878787]">{partyDetails.memberCount} online</span>
                        </div>
                    </div>

                    <div class="flex gap-3 w-full">
                        <button
                            class="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-colors"
                            on:click={() => mode = "join"}
                        >
                            Back
                        </button>
                        <button
                            class="flex-1 py-3 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-colors"
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