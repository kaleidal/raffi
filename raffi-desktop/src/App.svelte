<script lang="ts">
    import Meta from "./pages/meta/Meta.svelte";
    import Home from "./pages/Home.svelte";
    import Player from "./pages/player/Player.svelte";
    import { router } from "./lib/stores/router";
    import { onMount, tick } from "svelte";
    import { get } from "svelte/store";
    import Lists from "./pages/lists/Lists.svelte";
    import { enableRPC, disableRPC } from "./lib/rpc";


    import { X } from "lucide-svelte";
    import LoadingSpinner from "./components/common/LoadingSpinner.svelte";
    import {
        currentUser,
        initAuth,
        updateStatus,
    } from "./lib/stores/authStore";
    import { initAnalytics, setAnalyticsUser, trackEvent, trackPageView } from "./lib/analytics";
    import { overlayZoomStyle } from "./lib/overlayZoom";
    import { formatReleaseNotes } from "./lib/updateNotes";
    import { userZoom } from "./lib/stores/settingsStore";
    import { warmTraktClientAuth } from "./lib/db/db";
    import ZoomModal from "./components/common/ZoomModal.svelte";

    const pages = {
        home: Home,
        meta: Meta,
        player: Player,
        lists: Lists,
    };

    type DecoderStatus = {
        state: string;
        reason: string;
        message: string;
        detail: string;
        pid: number | null;
        updatedAt: number;
    };

    const defaultDecoderStatus = (): DecoderStatus => ({
        state: "idle",
        reason: "idle",
        message: "",
        detail: "",
        pid: null,
        updatedAt: 0,
    });

    let checkingAuth = true;
    let showTitleBar = false;
    let displayZoom = 1;
    let showUpdatePrompt = false;
    let decoderStatus: DecoderStatus = defaultDecoderStatus();
    let dismissedDecoderStatusAt = 0;
    let decoderDetailsCopied = false;
    let decoderDetailsCopyTimeout: ReturnType<typeof setTimeout> | null = null;
    let updateLaterTimeout: ReturnType<typeof setTimeout> | null = null;
    let updateTestArmed = false;
    let updateTestTimeout: ReturnType<typeof setTimeout> | null = null;
    let scrollContainerElem: HTMLDivElement | null = null;
    let lastRouteKey = "";

    const UPDATE_REMIND_DELAY = 30 * 60 * 1000;
    const UPDATE_TEST_ARM_DELAY = 1500;
    const ISSUE_TRACKER_URL = "https://github.com/kaleidal/raffi/issues";

    const normalizeDecoderStatus = (value: any): DecoderStatus => ({
        state: typeof value?.state === "string" ? value.state : "idle",
        reason: typeof value?.reason === "string" ? value.reason : "idle",
        message: typeof value?.message === "string" ? value.message : "",
        detail: typeof value?.detail === "string" ? value.detail : "",
        pid: typeof value?.pid === "number" && Number.isFinite(value.pid) ? value.pid : null,
        updatedAt:
            typeof value?.updatedAt === "number" && Number.isFinite(value.updatedAt)
                ? value.updatedAt
                : Date.now(),
    });

    const applyDecoderStatus = (value: any) => {
        const next = normalizeDecoderStatus(value);
        const previousUpdatedAt = decoderStatus.updatedAt;
        const previousState = decoderStatus.state;
        decoderStatus = next;

        if (next.state === "ready") {
            dismissedDecoderStatusAt = 0;
            return;
        }

        if (
            next.state === "unavailable" &&
            (next.updatedAt !== previousUpdatedAt || previousState !== next.state)
        ) {
            dismissedDecoderStatusAt = 0;
        }
    };

    const dismissDecoderFailure = () => {
        dismissedDecoderStatusAt = decoderStatus.updatedAt;
    };

    const openIssueTracker = () => {
        const target = ISSUE_TRACKER_URL;
        const electronApi = (window as any).electronAPI as
            | { openExternal?: (url: string) => Promise<void> }
            | undefined;

        if (electronApi?.openExternal) {
            electronApi.openExternal(target).catch(() => {
                if (typeof window !== "undefined") {
                    window.location.assign(target);
                }
            });
            return;
        }

        if (typeof window !== "undefined") {
            window.location.assign(target);
        }
    };

    const copyDecoderDetails = async () => {
        const detailText =
            decoderStatus.detail || "No additional details were provided by the playback server.";

        try {
            if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(detailText);
            } else if (typeof document !== "undefined") {
                const textArea = document.createElement("textarea");
                textArea.value = detailText;
                textArea.style.position = "fixed";
                textArea.style.opacity = "0";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand("copy");
                document.body.removeChild(textArea);
            } else {
                return;
            }

            decoderDetailsCopied = true;
            if (decoderDetailsCopyTimeout) {
                clearTimeout(decoderDetailsCopyTimeout);
            }
            decoderDetailsCopyTimeout = setTimeout(() => {
                decoderDetailsCopied = false;
            }, 2000);
        } catch {
            decoderDetailsCopied = false;
        }
    };

    $: showDecoderFailure =
        decoderStatus.state === "unavailable" &&
        decoderStatus.updatedAt !== 0 &&
        decoderStatus.updatedAt !== dismissedDecoderStatusAt;

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
        if (event.ctrlKey) {
            const key = event.key.toLowerCase();
            if (key === "=" || key === "+" || (event.shiftKey && (key === "=" || key === "+"))) {
                event.preventDefault();
                userZoom.update(z => Math.min(z + 0.1, 2.0));
                return;
            }
            if (key === "-" || key === "_" || (event.shiftKey && (key === "-" || key === "_"))) {
                event.preventDefault();
                userZoom.update(z => Math.max(z - 0.1, 0.5));
                return;
            }
            if (key === "0" || (event.shiftKey && key === "0")) {
                event.preventDefault();
                userZoom.set(1.0);
                return;
            }
        }

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

    const resetRouteScroll = async () => {
        await tick();

        const container = scrollContainerElem;
        if (container) {
            container.scrollTop = 0;
            container.scrollLeft = 0;
        }

        if (typeof window !== "undefined") {
            window.scrollTo(0, 0);
            window.requestAnimationFrame(() => {
                if (!scrollContainerElem) return;
                scrollContainerElem.scrollTop = 0;
                scrollContainerElem.scrollLeft = 0;
            });
        }
    };

    $: if (typeof document !== "undefined") {
        document.documentElement.style.setProperty(
            "--raffi-display-zoom",
            String(displayZoom),
        );
        document.documentElement.style.setProperty(
            "--raffi-user-zoom",
            String($userZoom),
        );
        document.documentElement.style.setProperty(
            "--raffi-effective-zoom",
            String(displayZoom * $userZoom),
        );
    }

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
                void warmTraktClientAuth();
            } catch (err) {
                console.error("Auth initialization failed", err);
            }
            if (disposed) return;

            checkingAuth = false;
        };

        init();
        window.addEventListener("pointerup", handlePointerButtons);
        window.addEventListener("keydown", handleUpdateTestKey);

        void (window as any).electronAPI?.windowControls?.getDisplayZoom?.()
            ?.then((value: number) => {
                if (disposed) return;
                if (typeof value === "number" && Number.isFinite(value)) {
                    displayZoom = value;
                }
            })
            ?.catch?.(() => {});

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

        void (window as any).electronAPI?.getDecoderStatus?.()
            ?.then((value: any) => {
                if (disposed) return;
                applyDecoderStatus(value);
            })
            ?.catch?.(() => {});

        const removeDecoderStatusListener =
            (window as any).electronAPI?.onDecoderStatusChanged?.((value: any) => {
                applyDecoderStatus(value);
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
            if (typeof removeDecoderStatusListener === "function") {
                removeDecoderStatusListener();
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
            if (decoderDetailsCopyTimeout) {
                clearTimeout(decoderDetailsCopyTimeout);
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
    $: {
        const nextRouteKey = `${$router.page}:${JSON.stringify($router.params)}`;
        if (nextRouteKey !== lastRouteKey) {
            lastRouteKey = nextRouteKey;
            if (!checkingAuth) {
                void resetRouteScroll();
            }
        }
    }
</script>

<div class="w-screen h-screen bg-[#090909] overflow-hidden flex flex-col">
    {#if showTitleBar}
        <div
            class="fixed top-0 left-0 right-0 h-[32px] z-[1000]"
            style="-webkit-app-region: drag"
        ></div> 
    {/if}

    <div bind:this={scrollContainerElem} class="relative flex-1 min-h-0 overflow-x-hidden overflow-y-auto" data-scroll-container>
        <div
            class="w-full h-full"
            style={`transform: scale(${displayZoom * $userZoom}); transform-origin: top left; width: calc(100% / ${displayZoom * $userZoom}); height: calc(100% / ${displayZoom * $userZoom});`}
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

    <ZoomModal />

    {#if showDecoderFailure}
        <div
            class="fixed inset-0 z-[900] bg-[#101010]/56 backdrop-blur-xl flex items-center justify-center px-4"
            style={overlayZoomStyle}
            on:click|self={dismissDecoderFailure}
            on:keydown={(e) => e.key === "Escape" && dismissDecoderFailure()}
            role="button"
            tabindex="0"
        >
            <div
                class="w-full max-w-3xl max-h-[80vh] rounded-[32px] bg-[#2b2b2b]/58 backdrop-blur-[40px] p-6 md:p-8 flex flex-col gap-5 relative overflow-hidden shadow-[0_40px_160px_rgba(0,0,0,0.45)]"
                on:click|stopPropagation
                on:keydown|stopPropagation
                role="dialog"
                aria-modal="true"
                aria-labelledby="decoder-status-title"
                tabindex="-1"
            >
                <div class="flex items-start justify-between gap-4">
                    <div>
                        <h2 id="decoder-status-title" class="text-white text-2xl font-poppins font-semibold leading-tight">
                            {decoderStatus.message || "Raffi could not reach its playback server."}
                        </h2>
                        <p class="text-white/50 text-sm">
                            Video playback and anything that depends on the local server will stay unavailable until it comes back.
                        </p>
                    </div>
                    <button
                        class="text-white/50 hover:text-white transition-colors cursor-pointer"
                        on:click={dismissDecoderFailure}
                        aria-label="Dismiss playback server dialog"
                    >
                        <X size={24} strokeWidth={2} />
                    </button>
                </div>

                <div class="rounded-2xl bg-white/[0.05] px-4 py-3 text-sm text-white/70 leading-6">
                    Try restarting Raffi. If this keeps happening, check the desktop logs for decoder startup or exit errors.
                </div>

                <div class="rounded-2xl bg-black/20 px-4 py-3 text-sm leading-6">
                    <div class="mb-1 flex items-center justify-between gap-3">
                        <p class="text-white/45 text-xs">Error details</p>
                        <button
                            class="text-xs px-2.5 py-1 rounded-lg bg-white/10 text-white/75 hover:bg-white/20 hover:text-white transition-colors cursor-pointer"
                            on:click={copyDecoderDetails}
                        >
                            {decoderDetailsCopied ? "Copied" : "Copy"}
                        </button>
                    </div>
                    <p class="text-white/75">{decoderStatus.detail || "No additional details were provided by the playback server."}</p>
                </div>

                <div class="flex flex-col gap-3 sm:flex-row sm:justify-end">
                    <button
                        class="px-4 py-2 rounded-2xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors cursor-pointer"
                        on:click={openIssueTracker}
                    >
                        Open issue tracker
                    </button>
                    <button
                        class="px-4 py-2 rounded-2xl bg-white text-black font-semibold hover:bg-white/90 transition-colors cursor-pointer"
                        on:click={dismissDecoderFailure}
                    >
                        Dismiss
                    </button>
                </div>
            </div>
        </div>
    {/if}

    {#if showUpdatePrompt}
        <div
            class="fixed inset-0 z-[500] bg-black/80 backdrop-blur-sm flex items-center justify-center"
            style={overlayZoomStyle}
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
