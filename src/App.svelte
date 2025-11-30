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

    onMount(async () => {
        await initAuth();
        checkingAuth = false;

        if (!$currentUser && $router.page !== "login") {
            router.navigate("login");
        }
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
    <svelte:component this={pages[$router.page]} />
{/if}
