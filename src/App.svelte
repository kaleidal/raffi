<script lang="ts">
    import Meta from "./pages/Meta.svelte";
    import Router from "svelte-spa-router";
    import Login from "./pages/auth/Login.svelte";

    const routes = {
        "/login": Login,
        "/meta": Meta,
    };
</script>

<Router {routes} />
