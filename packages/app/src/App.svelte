<script lang="ts">
    import Home from "./pages/Home.svelte";
    import { router } from "./lib/stores/router";
    import { onDestroy, onMount, tick } from "svelte";
    import { get } from "svelte/store";
    import { enableRPC, disableRPC } from "./lib/shell/rpc";
    import Button from "./components/common/controls/Button.svelte";
    import Dialog from "./components/common/dialog/Dialog.svelte";
    import ShapeLoader from "./components/common/loading/ShapeLoader.svelte";
    import SettingsModal from "./components/settings/SettingsModal.svelte";
    import {
        initAuth,
        updateStatus,
    } from "./lib/stores/authStore";
    import { formatReleaseNotes } from "./lib/shell/updateNotes";
    import { warmTraktClientAuth } from "./lib/db/db";
    import { isAndroidPlatform, isDesktopPlatform } from "./lib/shell/platform";
    import { acceptDroppedVideos, playLocalVideo } from "./lib/shell/localFile";
    import { nativeVideoVisible } from "./lib/android/nativeVideo";
    import { applyTheme } from "./lib/appearance/theme";
    import { loadCustomThemes } from "./lib/appearance/customThemes";

    onDestroy(applyTheme());
    onDestroy(loadCustomThemes());

    type PageComponent = typeof Home | any;

    const pageLoaders: Record<string, () => Promise<{ default: PageComponent }>> = {
        meta: () => import("./pages/meta/Meta.svelte") as Promise<{ default: PageComponent }>,
        player: () =>
            (isAndroidPlatform
                ? import("./pages/player/android/AndroidPlayer.svelte")
                : import("./pages/player/Player.svelte")) as Promise<{ default: PageComponent }>,
        lists: () => import("./pages/lists/Lists.svelte") as Promise<{ default: PageComponent }>,
        live: () => import("./pages/live/LiveTV.svelte") as Promise<{ default: PageComponent }>,
        "live-player": () => import("./pages/live/player/LivePlayer.svelte") as Promise<{ default: PageComponent }>,
    };

    const pageCache: Record<string, PageComponent> = {
        home: Home,
    };
    const pendingPages: Record<string, Promise<PageComponent> | undefined> = {};

    const PREFETCH_AFTER: Record<string, string> = {
        home: "meta",
        meta: "player",
        live: "live-player",
    };

    let ActivePage = $state.raw<PageComponent>(Home);
    let routeLoading = $state(false);
    let pageLoadToken = 0;

    const loadPage = (page: string) => {
        const cached = pageCache[page];
        if (cached) return Promise.resolve(cached);

        const loader = pageLoaders[page];
        if (!loader) return Promise.resolve(Home);

        const pending = pendingPages[page];
        if (pending) return pending;

        const promise = loader()
            .then((mod) => {
                pageCache[page] = mod.default;
                return mod.default;
            })
            .finally(() => {
                delete pendingPages[page];
            });
        pendingPages[page] = promise;
        return promise;
    };

    const prefetchPage = (page: string) => {
        if (pageCache[page] || !pageLoaders[page]) return;
        void loadPage(page).catch(() => {});
    };

    const ensurePageLoaded = async (page: string) => {
        const token = ++pageLoadToken;
        const cached = pageCache[page];
        if (cached) {
            ActivePage = cached;
            routeLoading = false;
            return;
        }

        routeLoading = true;

        try {
            const component = await loadPage(page);
            if (token !== pageLoadToken) return;
            ActivePage = component;
        } catch (err) {
            console.error(`Failed to load page module: ${page}`, err);
            if (token !== pageLoadToken) return;
            ActivePage = Home;
        } finally {
            if (token === pageLoadToken) routeLoading = false;
        }
    };

    $effect.pre(() => {
        void ensurePageLoaded($router.page);
    });

    $effect(() => {
        const next = PREFETCH_AFTER[$router.page];
        if (next) prefetchPage(next);
    });

    let showTitleBar = $state(false);
    let showUpdatePrompt = $state(false);
    let updateLaterTimeout: ReturnType<typeof setTimeout> | null = null;
    let updateTestArmed = false;
    let updateTestTimeout: ReturnType<typeof setTimeout> | null = null;
    let scrollContainerElem: HTMLDivElement | null = null;

    const routeKey = $derived(`${$router.page}:${JSON.stringify($router.params)}`);

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

    onMount(() => {
        showTitleBar = Boolean((window as any)?.electronAPI?.usesTitleBarOverlay);

        try {
            const storedRpc = localStorage.getItem("discord_rpc_enabled");
            const rpcEnabled = storedRpc !== null ? storedRpc === "true" : true;
            if (rpcEnabled) {
                enableRPC();
            } else {
                disableRPC();
            }
        } catch {
            // ignore
        }

        const init = async () => {
            try {
                await initAuth();
                void warmTraktClientAuth();
            } catch (err) {
                console.error("Auth initialization failed", err);
            }
        };

        init();
        window.addEventListener("pointerup", handlePointerButtons);
        window.addEventListener("keydown", handleUpdateTestKey);

        (window as any).electronAPI?.onOpenFile?.(playLocalVideo);
        const stopAcceptingDrops = isDesktopPlatform ? acceptDroppedVideos() : null;

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
            window.removeEventListener("pointerup", handlePointerButtons);
            stopAcceptingDrops?.();
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

    $effect(() => {
        document.body.classList.toggle("native-video", $nativeVideoVisible);
    });

    $effect(() => {
        routeKey;
        void resetRouteScroll();
    });
</script>

<div class="w-screen h-screen overflow-hidden flex flex-col {$nativeVideoVisible ? '' : 'bg-canvas'}">
    {#if showTitleBar}
        <div
            class="fixed top-0 left-0 right-0 h-[32px] z-[1000]"
            style="-webkit-app-region: drag"
        ></div> 
    {/if}

    <div bind:this={scrollContainerElem} class="relative flex-1 min-h-0 overflow-x-hidden overflow-y-auto" data-scroll-container>
        <div class="w-full min-h-full">
            <ActivePage {...$router.params as any} />

            {#if routeLoading}
                <div
                    class="fixed inset-0 z-[400] flex items-center justify-center bg-canvas"
                    aria-live="polite"
                    aria-label="Loading page"
                >
                    <ShapeLoader size="60px" />
                </div>
            {/if}
        </div>
    </div>


    <SettingsModal />

    {#if showUpdatePrompt}
        <Dialog
            title={$updateStatus.version ? `Raffi ${$updateStatus.version} is ready` : "Update ready"}
            onClose={handleUpdateLater}
            class="max-w-lg"
        >
            <div class="release-notes-content min-h-0 overflow-y-auto text-sm text-ink/70">
                {@html formatReleaseNotes($updateStatus.notes || "Release notes unavailable.")}
            </div>

            {#snippet actions()}
                <Button onclick={handleUpdateLater}>Later</Button>
                <Button variant="primary" onclick={handleUpdateRestart}>Restart now</Button>
            {/snippet}
        </Dialog>
    {/if}

</div>
