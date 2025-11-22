<script lang="ts">
    import Meta from "./pages/Meta.svelte";
    import Login from "./pages/auth/Login.svelte";
    import Home from "./pages/Home.svelte";
    import Player from "./pages/Player.svelte";
    import { router } from "./lib/stores/router";
    import { supabase } from "./lib/db/supabase";
    import { onMount } from "svelte";

    const pages = {
        home: Home,
        login: Login,
        meta: Meta,
        player: Player,
    };

    let isAuthenticated = false;
    let checkingAuth = true;

    onMount(() => {
        (async () => {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            isAuthenticated = !!user;
            checkingAuth = false;

            if (!isAuthenticated && $router.page !== "login") {
                router.navigate("login");
            }
        })();

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
            isAuthenticated = !!session?.user;

            if (!isAuthenticated && $router.page !== "login") {
                router.navigate("login");
            } else if (isAuthenticated && $router.page === "login") {
                router.navigate("home");
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    });
</script>

{#if checkingAuth}
    <div
        class="w-screen h-screen bg-[#090909] flex items-center justify-center"
    >
        <div class="text-[#878787] font-poppins font-medium text-2xl">
            Loading...
        </div>
    </div>
{:else if !isAuthenticated && $router.page !== "login"}
    <Login />
{:else}
    <svelte:component this={pages[$router.page]} />
{/if}
