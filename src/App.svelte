<script lang="ts">
    import Meta from "./pages/Meta.svelte";
    import Login from "./pages/auth/Login.svelte";
    import Home from "./pages/Home.svelte";
    import Player from "./pages/Player.svelte";
    import { router } from "./lib/stores/router";

    // Map pages to components
    const pages = {
        home: Home,
        login: Login,
        meta: Meta,
        player: Player,
    };
</script>

<svelte:component this={pages[$router.page]} />
