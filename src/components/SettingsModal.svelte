<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import { fade, scale } from "svelte/transition";
    import { getLibrary, getListsWithItems } from "../lib/db/db";
    import { enableRPC, disableRPC } from "../lib/rpc";
    import { supabase } from "../lib/db/supabase";
    import { currentUser } from "../lib/stores/authStore";
    import { router } from "../lib/stores/router";

    export let showSettings = false;

    const dispatch = createEventDispatcher();

    let stats = {
        moviesWatched: 0,
        showsWatched: 0,
    };

    let discordRpcEnabled = true;
    let email = "";
    let newEmail = "";
    let newPassword = "";
    let message = "";
    let error = "";

    onMount(async () => {
        // Load stats
        try {
            const library = await getLibrary(1000);
            stats.moviesWatched = library.filter(
                (i) => i.type === "movie" || !i.type,
            ).length;
            stats.showsWatched = library.filter(
                (i) => i.type === "series",
            ).length;
        } catch (e) {
            console.error("Failed to load stats", e);
        }

        // Load RPC setting
        const storedRpc = localStorage.getItem("discord_rpc_enabled");
        if (storedRpc !== null) {
            discordRpcEnabled = storedRpc === "true";
        } else {
            discordRpcEnabled = true;
        }

        if ($currentUser?.email) {
            email = $currentUser.email;
        }
    });

    function close() {
        showSettings = false;
        dispatch("close");
    }

    function toggleRpc() {
        discordRpcEnabled = !discordRpcEnabled;
        localStorage.setItem(
            "discord_rpc_enabled",
            discordRpcEnabled.toString(),
        );
        if (discordRpcEnabled) {
            enableRPC();
        } else {
            disableRPC();
        }
    }

    async function downloadData() {
        try {
            const library = await getLibrary(10000);
            const lists = await getListsWithItems();

            const data = {
                library,
                lists,
                exportedAt: new Date().toISOString(),
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `raffi-data-${new Date().toISOString().split("T")[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error("Failed to download data", e);
            error = "Failed to download data";
        }
    }

    async function handleLogout() {
        await supabase.auth.signOut();
        router.navigate("login");
    }

    async function updateEmail() {
        if (!newEmail) return;
        message = "";
        error = "";
        try {
            const { error: err } = await supabase.auth.updateUser({
                email: newEmail,
            });
            if (err) throw err;
            message = "Check your new email for a confirmation link.";
            newEmail = "";
        } catch (e: any) {
            error = e.message;
        }
    }

    async function updatePassword() {
        if (!newPassword) return;
        message = "";
        error = "";
        try {
            const { error: err } = await supabase.auth.updateUser({
                password: newPassword,
            });
            if (err) throw err;
            message = "Password updated successfully.";
            newPassword = "";
        } catch (e: any) {
            error = e.message;
        }
    }
</script>

{#if showSettings}
    <div
        class="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-20"
        transition:fade={{ duration: 200 }}
        on:click|self={close}
        on:keydown={(e) => e.key === "Escape" && close()}
        role="button"
        tabindex="0"
    >
        <div
            class="bg-[#121212] w-full max-w-4xl max-h-[90vh] rounded-[32px] overflow-hidden flex flex-col"
            transition:scale={{ start: 0.95, duration: 200 }}
        >
            <!-- Header -->
            <div class="p-8 flex justify-between items-center">
                <h2 class="text-white text-3xl font-poppins font-bold">
                    Settings
                </h2>
                <button
                    on:click={close}
                    class="text-white/50 hover:text-white transition-colors cursor-pointer"
                    aria-label="Close settings"
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
                        ><line x1="18" y1="6" x2="6" y2="18"></line><line
                            x1="6"
                            y1="6"
                            x2="18"
                            y2="18"
                        ></line></svg
                    >
                </button>
            </div>

            <!-- Content -->
            <div class="flex-1 overflow-y-auto p-8">
                <div class="flex flex-col gap-8">
                    <!-- Statistics -->
                    <section class="flex flex-col gap-4">
                        <h3
                            class="text-white/70 text-lg font-poppins font-semibold"
                        >
                            Your Stats
                        </h3>
                        <div class="grid grid-cols-2 gap-4">
                            <div class="bg-white/5 p-6 rounded-xl">
                                <div class="text-white/50 text-sm mb-1">
                                    Movies
                                </div>
                                <div
                                    class="text-white text-3xl font-bold font-poppins"
                                >
                                    {stats.moviesWatched}
                                </div>
                            </div>
                            <div class="bg-white/5 p-6 rounded-xl">
                                <div class="text-white/50 text-sm mb-1">
                                    Shows
                                </div>
                                <div
                                    class="text-white text-3xl font-bold font-poppins"
                                >
                                    {stats.showsWatched}
                                </div>
                            </div>
                        </div>
                    </section>

                    <!-- Preferences -->
                    <section class="flex flex-col gap-4">
                        <h3
                            class="text-white/70 text-lg font-poppins font-semibold"
                        >
                            Preferences
                        </h3>
                        <div
                            class="bg-white/5 p-5 rounded-xl flex justify-between items-center"
                        >
                            <div>
                                <div class="text-white font-medium">
                                    Discord Rich Presence
                                </div>
                                <div class="text-white/50 text-sm">
                                    Show what you're watching
                                </div>
                            </div>
                            <button
                                class="w-14 h-8 rounded-full transition-colors duration-200 relative cursor-pointer {discordRpcEnabled
                                    ? 'bg-white'
                                    : 'bg-white/20'}"
                                on:click={toggleRpc}
                                aria-label="Toggle Discord Rich Presence"
                                role="switch"
                                aria-checked={discordRpcEnabled}
                            >
                                <div
                                    class="absolute top-1 left-1 w-6 h-6 {discordRpcEnabled
                                        ? 'bg-black'
                                        : 'bg-white'} rounded-full transition-all duration-200 {discordRpcEnabled
                                        ? 'translate-x-6'
                                        : 'translate-x-0'}"
                                ></div>
                            </button>
                        </div>
                    </section>

                    <!-- Data -->
                    <section class="flex flex-col gap-4">
                        <h3
                            class="text-white/70 text-lg font-poppins font-semibold"
                        >
                            Data
                        </h3>
                        <div
                            class="bg-white/5 p-5 rounded-xl flex justify-between items-center"
                        >
                            <div>
                                <div class="text-white font-medium">
                                    Export Data
                                </div>
                                <div class="text-white/50 text-sm">
                                    Download as JSON
                                </div>
                            </div>
                            <button
                                class="bg-white text-black px-6 py-2 rounded-xl font-medium hover:bg-white/90 transition-colors cursor-pointer"
                                on:click={downloadData}
                            >
                                Download
                            </button>
                        </div>
                    </section>

                    <!-- Account -->
                    <section class="flex flex-col gap-4">
                        <h3
                            class="text-white/70 text-lg font-poppins font-semibold"
                        >
                            Account
                        </h3>
                        <div
                            class="bg-white/5 p-5 rounded-xl flex flex-col gap-5"
                        >
                            <div>
                                <div class="text-white/50 text-sm mb-1">
                                    Current Email
                                </div>
                                <div class="text-white">{email}</div>
                            </div>

                            <div class="h-px w-full bg-white/10"></div>

                            <div class="flex flex-col gap-3">
                                <div class="text-white font-medium">
                                    Change Email
                                </div>
                                <div class="flex gap-2">
                                    <input
                                        type="email"
                                        placeholder="New Email"
                                        bind:value={newEmail}
                                        class="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-white placeholder-white/30 outline-none focus:border-white/30 transition-colors"
                                    />
                                    <button
                                        class="bg-white text-black px-6 py-2 rounded-xl font-medium hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                        on:click={updateEmail}
                                        disabled={!newEmail}
                                    >
                                        Update
                                    </button>
                                </div>
                            </div>

                            <div class="h-px w-full bg-white/10"></div>

                            <div class="flex flex-col gap-3">
                                <div class="text-white font-medium">
                                    Change Password
                                </div>
                                <div class="flex gap-2">
                                    <input
                                        type="password"
                                        placeholder="New Password"
                                        bind:value={newPassword}
                                        class="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-white placeholder-white/30 outline-none focus:border-white/30 transition-colors"
                                    />
                                    <button
                                        class="bg-white text-black px-6 py-2 rounded-xl font-medium hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                        on:click={updatePassword}
                                        disabled={!newPassword}
                                    >
                                        Update
                                    </button>
                                </div>
                            </div>

                            {#if message}
                                <div
                                    class="p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-sm"
                                >
                                    {message}
                                </div>
                            {/if}
                            {#if error}
                                <div
                                    class="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm"
                                >
                                    {error}
                                </div>
                            {/if}

                            <div class="h-px w-full bg-white/10"></div>

                            <button
                                class="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl font-medium transition-colors cursor-pointer"
                                on:click={handleLogout}
                            >
                                Log Out
                            </button>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    </div>
{/if}
