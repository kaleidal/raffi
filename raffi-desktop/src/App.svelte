<script lang="ts">
    import Meta from "./pages/meta/Meta.svelte";
    import Home from "./pages/Home.svelte";
    import Player from "./pages/player/Player.svelte";
    import { router } from "./lib/stores/router";
    import { onMount } from "svelte";
    import { get } from "svelte/store";
    import Lists from "./pages/lists/Lists.svelte";
    import { enableRPC, disableRPC } from "./lib/rpc";


    import { X } from "lucide-svelte";
    import LoadingSpinner from "./components/common/LoadingSpinner.svelte";
    import {
        currentUser,
        initAuth,
        legacyMigrationNeeded,
        migrateLegacySessionAndSignInAve,
        migrateLegacySessionToLocal,
        dismissLegacyMigrationPrompt,
        updateStatus,
    } from "./lib/stores/authStore";
    import { initAnalytics, setAnalyticsUser, trackEvent, trackPageView } from "./lib/analytics";
    import { formatReleaseNotes } from "./lib/updateNotes";

    const pages = {
        home: Home,
        meta: Meta,
        player: Player,
        lists: Lists,
    };

    let checkingAuth = true;
    let showTitleBar = false;
    let displayZoom = 1;
    let showUpdatePrompt = false;
    let legacyMigrationBusy = false;
    let legacyMigrationError = "";
    let updateLaterTimeout: ReturnType<typeof setTimeout> | null = null;
    let updateTestArmed = false;
    let updateTestTimeout: ReturnType<typeof setTimeout> | null = null;

    const UPDATE_REMIND_DELAY = 30 * 60 * 1000;
    const UPDATE_TEST_ARM_DELAY = 1500;

    function handlePointerButtons(event: PointerEvent) {
        if (event.pointerType !== "mouse") return;
        if (event.button === 3) {
            const navigated = router.back();
            if (navigated) {
                event.preventDefault();
            }
        }
    }

    const triggerUpdateTest = () => {
        updateStatus.set({
            available: true,
            downloaded: true,
            downloadProgress: 100,
            version: "test-build",
            releaseDate: new Date().toISOString(),
            notes: "# Test update\n\n- In-app update modal\n- Settings update banner\n- Update badge on settings",
        });
        showUpdatePrompt = true;
    };

    const handleUpdateTestKey = (event: KeyboardEvent) => {
        if (!event.ctrlKey || !event.shiftKey) return;
        const key = event.key.toLowerCase();
        if (key === "t") {
            updateTestArmed = true;
            if (updateTestTimeout) clearTimeout(updateTestTimeout);
            updateTestTimeout = setTimeout(() => {
                updateTestArmed = false;
            }, UPDATE_TEST_ARM_DELAY);
            return;
        }
        if (key === "u" && updateTestArmed) {
            updateTestArmed = false;
            if (updateTestTimeout) {
                clearTimeout(updateTestTimeout);
            }
            triggerUpdateTest();
        }
    };

    const scheduleUpdatePrompt = () => {
        if (updateLaterTimeout) {
            clearTimeout(updateLaterTimeout);
        }
        updateLaterTimeout = setTimeout(() => {
            if (get(updateStatus).downloaded) {
                showUpdatePrompt = true;
            }
        }, UPDATE_REMIND_DELAY);
    };

    const handleUpdateLater = () => {
        showUpdatePrompt = false;
        scheduleUpdatePrompt();
    };

    const handleUpdateRestart = () => {
        showUpdatePrompt = false;
        (window as any).electronAPI?.installUpdate?.();
    };

    const handleMigrateToLocal = async () => {
        legacyMigrationBusy = true;
        legacyMigrationError = "";
        try {
            await migrateLegacySessionToLocal();
            router.navigate("home");
        } catch (err: any) {
            legacyMigrationError = err?.message || "Failed to migrate legacy session";
        } finally {
            legacyMigrationBusy = false;
        }
    };

    const handleMigrateAndSignInAve = async () => {
        legacyMigrationBusy = true;
        legacyMigrationError = "";
        try {
            await migrateLegacySessionAndSignInAve();
            router.navigate("home");
        } catch (err: any) {
            legacyMigrationError = err?.message || "Failed to migrate legacy session";
        } finally {
            legacyMigrationBusy = false;
        }
    };

    onMount(() => {
        let disposed = false;

        showTitleBar = Boolean((window as any)?.electronAPI?.usesTitleBarOverlay);

        initAnalytics();
        trackEvent("app_started");
        trackPageView($router.page);

        try {
            const storedRpc = localStorage.getItem("discord_rpc_enabled");
            const rpcEnabled = storedRpc !== null ? storedRpc === "true" : true;
            if (rpcEnabled) {
                enableRPC();
            } else {
                disableRPC();
            }
        } catch (e) {
            // ignore
        }

        const init = async () => {
            try {
                await initAuth();
            } catch (err) {
                console.error("Auth initialization failed", err);
            }
            if (disposed) return;

            checkingAuth = false;
        };

        init();
        window.addEventListener("pointerup", handlePointerButtons);
        window.addEventListener("keydown", handleUpdateTestKey);

        // Listen for file open events
        if ((window as any).electronAPI?.onOpenFile) {
            (window as any).electronAPI.onOpenFile((filePath: string) => {
                console.log("Opening file:", filePath);
                router.navigate("player", { 
                    videoSrc: filePath,
                    startTime: 0,
                    metaData: null,
                    fileIdx: null,
                    season: null,
                    episode: null
                });
            });
        }

        const removeZoomListener =
            (window as any).electronAPI?.onDisplayZoom?.((value: number) => {
                if (typeof value === "number" && Number.isFinite(value)) {
                    displayZoom = value;
                }
            }) ?? null;

        const handleUpdateTestEvent = () => {
            triggerUpdateTest();
        };
        window.addEventListener("raffi-test-update", handleUpdateTestEvent as EventListener);

        const normalizeUpdateInfo = (info: any) => ({
            version: info?.version ?? null,
            notes: info?.notes ?? "",
            releaseDate: info?.releaseDate ?? null,
        });

        const removeUpdateAvailable =
            (window as any).electronAPI?.onUpdateAvailable?.((info: any) => {
                updateStatus.update((state) => ({
                    ...state,
                    available: true,
                    downloaded: false,
                    downloadProgress: 0,
                    ...normalizeUpdateInfo(info),
                }));
            }) ?? null;

        const removeUpdateDownloaded =
            (window as any).electronAPI?.onUpdateDownloaded?.((info: any) => {
                updateStatus.update((state) => ({
                    ...state,
                    available: true,
                    downloaded: true,
                    downloadProgress: 100,
                    ...normalizeUpdateInfo(info),
                }));
                showUpdatePrompt = true;
            }) ?? null;

        const removeUpdateDownloadProgress =
            (window as any).electronAPI?.onUpdateDownloadProgress?.((info: any) => {
                const rawPercent = Number(info?.percent);
                const percent = Number.isFinite(rawPercent)
                    ? Math.max(0, Math.min(100, rawPercent))
                    : null;

                updateStatus.update((state) => ({
                    ...state,
                    available: true,
                    downloadProgress: percent,
                    downloaded: percent != null && percent >= 100 ? true : state.downloaded,
                }));
            }) ?? null;

        return () => {
            disposed = true;
            window.removeEventListener("pointerup", handlePointerButtons);
            if (typeof removeZoomListener === "function") {
                removeZoomListener();
            }
            if (typeof removeUpdateAvailable === "function") {
                removeUpdateAvailable();
            }
            if (typeof removeUpdateDownloaded === "function") {
                removeUpdateDownloaded();
            }
            if (typeof removeUpdateDownloadProgress === "function") {
                removeUpdateDownloadProgress();
            }
            if (updateLaterTimeout) {
                clearTimeout(updateLaterTimeout);
            }
            if (updateTestTimeout) {
                clearTimeout(updateTestTimeout);
            }
            window.removeEventListener("keydown", handleUpdateTestKey);
            window.removeEventListener(
                "raffi-test-update",
                handleUpdateTestEvent as EventListener,
            );
        };
    });

    $: trackPageView($router.page);
    $: setAnalyticsUser($currentUser);
</script>

<div class="w-screen h-screen bg-[#090909] overflow-hidden flex flex-col">
    {#if showTitleBar}
        <div
            class="fixed top-0 left-0 right-0 h-[32px] z-[1000]"
            style="-webkit-app-region: drag"
        ></div> 
    {/if}

    <div class="relative flex-1 min-h-0 overflow-x-hidden overflow-y-auto" data-scroll-container>
        <div
            class="w-full h-full"
            style={`transform: scale(${displayZoom}); transform-origin: top left; width: calc(100% / ${displayZoom}); height: calc(100% / ${displayZoom});`}
        >
            {#if checkingAuth}
                <div class="w-full h-full bg-[#090909] flex items-center justify-center">
                    <LoadingSpinner size="60px" />
                </div>
            {:else}
                <svelte:component this={pages[$router.page]} {...$router.params as any} />
            {/if}
        </div>
    </div>

    {#if showUpdatePrompt}
        <div
            class="fixed inset-0 z-[500] bg-black/80 backdrop-blur-sm flex items-center justify-center"
            on:click|self={handleUpdateLater}
            on:keydown={(e) => e.key === "Escape" && handleUpdateLater()}
            role="button"
            tabindex="0"
        >
            <div
                class="bg-[#121212] w-full max-w-lg max-h-[80vh] rounded-[32px] p-6 md:p-8 flex flex-col gap-5 shadow-[0_40px_160px_rgba(0,0,0,0.55)]"
                on:click|stopPropagation
                on:keydown|stopPropagation
                role="dialog"
                tabindex="-1"
            >
                <div class="flex items-start justify-between gap-4">
                    <div>
                        <h2 class="text-white text-2xl font-poppins font-semibold">
                            Update ready
                        </h2>
                        {#if $updateStatus.version}
                            <p class="text-white/50 text-sm">
                                Version {$updateStatus.version} is ready to install.
                            </p>
                        {/if}
                    </div>
                    <button
                        class="text-white/50 hover:text-white transition-colors cursor-pointer"
                        on:click={handleUpdateLater}
                        aria-label="Close update dialog"
                    >
                        <X size={24} strokeWidth={2} />
                    </button>
                </div>

                <div class="release-notes-content rounded-2xl bg-white/[0.04] p-4 text-white/70 text-sm overflow-y-auto max-h-[40vh]">
                    {@html formatReleaseNotes($updateStatus.notes || "Release notes unavailable.")}
                </div>

                <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p class="text-white/40 text-xs">We’ll remind you in 30 minutes.</p>
                    <div class="flex flex-col gap-3 sm:flex-row">
                        <button
                            class="flex-1 sm:flex-none px-4 py-2 rounded-2xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors cursor-pointer"
                            on:click={handleUpdateLater}
                        >
                            Later
                        </button>
                        <button
                            class="flex-1 sm:flex-none px-4 py-2 rounded-2xl bg-white text-black font-semibold hover:bg-white/90 transition-colors cursor-pointer"
                            on:click={handleUpdateRestart}
                        >
                            Restart now
                        </button>
                    </div>
                </div>
            </div>
        </div>
    {/if}

    {#if !checkingAuth && $legacyMigrationNeeded}
        <div class="fixed inset-0 z-[520] bg-black/80 backdrop-blur-sm flex items-center justify-center">
            <div class="bg-[#121212] w-full max-w-lg rounded-[32px] p-6 md:p-8 flex flex-col gap-5 shadow-[0_40px_160px_rgba(0,0,0,0.55)]">
                <div class="flex items-start justify-between gap-4">
                    <div>
                        <h2 class="text-white text-2xl font-poppins font-semibold">Legacy account detected</h2>
                        <p class="text-white/60 text-sm">
                            We found an old Supabase session. You can migrate data to local mode, or migrate then sign in with Ave.
                        </p>
                    </div>
                    <button
                        class="text-white/50 hover:text-white transition-colors cursor-pointer"
                        on:click={dismissLegacyMigrationPrompt}
                        aria-label="Dismiss migration dialog"
                        disabled={legacyMigrationBusy}
                    >
                        <X size={24} strokeWidth={2} />
                    </button>
                </div>

                {#if legacyMigrationError}
                    <div class="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                        {legacyMigrationError}
                    </div>
                {/if}

                <div class="flex flex-col gap-3">
                    <button
                        class="w-full px-4 py-3 rounded-2xl bg-white text-black font-semibold hover:bg-white/90 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                        on:click={handleMigrateAndSignInAve}
                        disabled={legacyMigrationBusy}
                    >
                        {legacyMigrationBusy ? "Working..." : "Migrate + Sign in with Ave"}
                    </button>
                    <button
                        class="w-full px-4 py-3 rounded-2xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                        on:click={handleMigrateToLocal}
                        disabled={legacyMigrationBusy}
                    >
                        Switch to local mode
                    </button>
                </div>
            </div>
        </div>
    {/if}
</div>

<style>
    .release-notes-content :global(h1),
    .release-notes-content :global(h2),
    .release-notes-content :global(h3),
    .release-notes-content :global(h4) {
        color: white;
        font-weight: 700;
        line-height: 1.2;
        margin: 0 0 0.65rem;
    }

    .release-notes-content :global(h1) {
        font-size: 1.2rem;
    }

    .release-notes-content :global(h2) {
        font-size: 1.075rem;
    }

    .release-notes-content :global(h3),
    .release-notes-content :global(h4) {
        font-size: 1rem;
    }

    .release-notes-content :global(p),
    .release-notes-content :global(ul),
    .release-notes-content :global(ol),
    .release-notes-content :global(blockquote),
    .release-notes-content :global(pre) {
        margin: 0 0 0.65rem;
    }

    .release-notes-content :global(ul) {
        list-style: disc;
        padding-left: 1.2rem;
    }

    .release-notes-content :global(ol) {
        list-style: decimal;
        padding-left: 1.2rem;
    }

    .release-notes-content :global(li) {
        margin: 0.2rem 0;
    }

    .release-notes-content :global(code) {
        background: rgba(255, 255, 255, 0.09);
        border-radius: 0.35rem;
        padding: 0.1rem 0.35rem;
        color: white;
        font-size: 0.85em;
    }

    .release-notes-content :global(blockquote) {
        border-left: 2px solid rgba(255, 255, 255, 0.3);
        padding-left: 0.65rem;
        color: rgba(255, 255, 255, 0.72);
    }

    .release-notes-content :global(a) {
        color: white;
        text-decoration: underline;
        text-underline-offset: 2px;
    }

    .release-notes-content :global(hr) {
        border: 0;
        border-top: 1px solid rgba(255, 255, 255, 0.18);
        margin: 0.75rem 0;
    }

    .release-notes-content :global(*:last-child) {
        margin-bottom: 0;
    }
</style>
