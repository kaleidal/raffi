<script lang="ts">
    import Meta from "./pages/meta/Meta.svelte";
    import Login from "./pages/auth/Login.svelte";
    import Home from "./pages/Home.svelte";
    import Player from "./pages/player/Player.svelte";
    import { router } from "./lib/stores/router";
    import { onMount } from "svelte";
    import Lists from "./pages/lists/Lists.svelte";

    import LoadingSpinner from "./components/common/LoadingSpinner.svelte";
    import { currentUser, initAuth } from "./lib/stores/authStore";

    const pages = {
        home: Home,
        login: Login,
        meta: Meta,
        player: Player,
        lists: Lists,
    };

    let checkingAuth = true;

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

        const init = async () => {
            await initAuth();
            if (disposed) return;

            checkingAuth = false;

            if (!$currentUser && $router.page !== "login") {
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

        return () => {
            disposed = true;
            window.removeEventListener("pointerup", handlePointerButtons);
        };
    });

    $: if (!checkingAuth) {
        if (!$currentUser && $router.page !== "login") {
            router.navigate("login");
        } else if ($currentUser && $router.page === "login") {
            router.navigate("home");
        }
    }
</script>

{#if checkingAuth}
    <div
        class="w-screen h-screen bg-[#090909] flex items-center justify-center"
    >
        <LoadingSpinner size="60px" />
    </div>
{:else if !$currentUser && $router.page !== "login"}
    <Login />
{:else}
    <svelte:component this={pages[$router.page]} {...$router.params as any} />
{/if}
