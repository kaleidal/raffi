<script lang="ts">
    import Meta from "./pages/meta/Meta.svelte";
    import Login from "./pages/auth/Login.svelte";
    import Home from "./pages/Home.svelte";
    import Player from "./pages/player/Player.svelte";
    import { router } from "./lib/stores/router";
    import { onMount } from "svelte";
    import Lists from "./pages/lists/Lists.svelte";
    import { enableRPC, disableRPC } from "./lib/rpc";

    import TitleBar from "./components/common/TitleBar.svelte";

    import LoadingSpinner from "./components/common/LoadingSpinner.svelte";
    import { currentUser, initAuth, localMode } from "./lib/stores/authStore";
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

    function handlePointerButtons(event: PointerEvent) {
        if (event.pointerType !== "mouse") return;
        if (event.button === 3) {
            const navigated = router.back();
            if (navigated) {
                event.preventDefault();
            }
        }
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
            await initAuth();
            if (disposed) return;

            checkingAuth = false;

            if (!$currentUser && !$localMode && $router.page !== "login") {
                router.navigate("login");
            }
        };

        init();
        window.addEventListener("pointerup", handlePointerButtons);

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

        return () => {
            disposed = true;
            window.removeEventListener("pointerup", handlePointerButtons);
            if (typeof removeZoomListener === "function") {
                removeZoomListener();
            }
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
        <TitleBar />
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
</div>
