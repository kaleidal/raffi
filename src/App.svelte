<script lang="ts">
    import Meta from "./pages/meta/Meta.svelte";
    import Login from "./pages/auth/Login.svelte";
    import Home from "./pages/Home.svelte";
    import Player from "./pages/player/Player.svelte";
    import { router } from "./lib/stores/router";
    import { onMount } from "svelte";
    import { get } from "svelte/store";
    import Lists from "./pages/lists/Lists.svelte";
    import { enableRPC, disableRPC } from "./lib/rpc";


    import LoadingSpinner from "./components/common/LoadingSpinner.svelte";
    import { currentUser, initAuth, localMode, updateStatus } from "./lib/stores/authStore";
    import { initAnalytics, setAnalyticsUser, trackEvent, trackPageView } from "./lib/analytics";

    const pages = {
        home: Home,
        login: Login,
        meta: Meta,
        player: Player,
        lists: Lists,
    };

    let checkingAuth = true;
    let showTitleBar = false;
    let displayZoom = 1;
    let showUpdatePrompt = false;
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
            await initAuth();
            if (disposed) return;

            checkingAuth = false;

            if (!$currentUser && !$localMode && $router.page !== "login") {
                router.navigate("login");
            }
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
                    ...normalizeUpdateInfo(info),
                }));
            }) ?? null;

        const removeUpdateDownloaded =
            (window as any).electronAPI?.onUpdateDownloaded?.((info: any) => {
                updateStatus.update((state) => ({
                    ...state,
                    available: true,
                    downloaded: true,
                    ...normalizeUpdateInfo(info),
                }));
                showUpdatePrompt = true;
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

    $: if (!checkingAuth) {
        if (!$currentUser && !$localMode && $router.page !== "login") {
            router.navigate("login");
        } else if (($currentUser || $localMode) && $router.page === "login") {
            router.navigate("home");
        }
    }

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
            {:else if !$currentUser && !$localMode && $router.page !== "login"}
                <Login />
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
                        <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div class="rounded-2xl bg-white/[0.04] p-4 text-white/70 text-sm whitespace-pre-wrap overflow-y-auto max-h-[40vh]">
                    {$updateStatus.notes || "Release notes unavailable."}
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
</div>
