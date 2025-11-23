<script lang="ts">
    import { fade, scale } from "svelte/transition";
    import { onMount } from "svelte";
    import { getAddons, addAddon, removeAddon } from "../lib/db/db";
    import type { Addon } from "../lib/db/db";

    export let showAddonsModal = false;

    let addonsList: Addon[] = [];
    let newAddonUrl = "";
    let loadingAddons = false;

    async function loadAddons() {
        loadingAddons = true;
        try {
            addonsList = await getAddons();
        } catch (e) {
            console.error("Failed to load addons", e);
        } finally {
            loadingAddons = false;
        }
    }

    async function handleAddAddon() {
        if (!newAddonUrl) return;
        if (
            !newAddonUrl.startsWith("http://") &&
            !newAddonUrl.startsWith("https://")
        ) {
            if (newAddonUrl.startsWith("stremio://")) {
                newAddonUrl = newAddonUrl.replace("stremio://", "https://");
            } else {
                alert("Invalid URL");
                return;
            }
        }

        if (!newAddonUrl.endsWith("/manifest.json")) {
            newAddonUrl += "/manifest.json";
        }

        const response = await fetch(newAddonUrl);
        const manifest = await response.json();
        if (!manifest) {
            alert("Invalid manifest");
            return;
        }

        try {
            await addAddon({
                transport_url: newAddonUrl.replace("/manifest.json", ""),
                manifest: manifest,
                flags: { protected: false, official: false },
                addon_id: crypto.randomUUID(),
            });
            newAddonUrl = "";
            await loadAddons();
        } catch (e) {
            console.error("Failed to add addon", e);
            alert("Failed to add addon");
        }
    }

    async function handleRemoveAddon(url: string) {
        if (!confirm("Are you sure?")) return;
        try {
            await removeAddon(url);
            await loadAddons();
        } catch (e) {
            console.error("Failed to remove addon", e);
        }
    }

    $: if (showAddonsModal) {
        loadAddons();
    }
</script>

{#if showAddonsModal}
    <div
        class="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-20"
        transition:fade={{ duration: 200 }}
        on:click|self={() => (showAddonsModal = false)}
        on:keydown={(e) => e.key === "Escape" && (showAddonsModal = false)}
        role="button"
        tabindex="0"
    >
        <div
            class="bg-[#121212] w-full max-w-2xl rounded-[32px] p-10 flex flex-col gap-6 relative"
            transition:scale={{ start: 0.95, duration: 200 }}
        >
            <div class="flex justify-between items-center">
                <h2 class="text-white text-2xl font-poppins font-bold">
                    Manage Addons
                </h2>
                <button
                    class="text-white/50 hover:text-white cursor-pointer"
                    on:click={() => (showAddonsModal = false)}
                    aria-label="Close modal"
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

            <div class="flex flex-col gap-4">
                <div class="flex gap-2">
                    <input
                        type="text"
                        placeholder="Enter addon URL"
                        class="flex-1 bg-white/5 rounded-xl px-4 py-3 text-white outline-none focus:border-white/30"
                        bind:value={newAddonUrl}
                    />
                    <button
                        class="bg-white text-black px-6 py-3 rounded-xl font-medium hover:bg-white/90 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                        on:click={handleAddAddon}
                        disabled={!newAddonUrl}
                    >
                        Add
                    </button>
                </div>

                <div class="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
                    {#if loadingAddons}
                        <div class="text-center text-white/50 py-4">
                            Loading...
                        </div>
                    {:else if addonsList.length === 0}
                        <div class="text-center text-white/50 py-4">
                            No addons installed
                        </div>
                    {:else}
                        {#each addonsList as addon}
                            <div
                                class="flex justify-between items-center bg-white/5 p-4 rounded-xl"
                            >
                                <div
                                    class="flex flex-row gap-[20px] items-center"
                                >
                                    <img
                                        src={addon.manifest.logo}
                                        alt=""
                                        class="w-12 h-12 object-contain"
                                    />
                                    <span
                                        class="text-white/80 text-[20px] truncate flex-1 mr-4"
                                        >{addon.manifest.name}</span
                                    >
                                </div>
                                <button
                                    class="text-red-400 hover:text-red-300 p-2 cursor-pointer"
                                    on:click={() =>
                                        handleRemoveAddon(addon.transport_url)}
                                    aria-label="Remove addon"
                                >
                                    <svg
                                        width="20"
                                        height="20"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        ><polyline points="3 6 5 6 21 6"
                                        ></polyline><path
                                            d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                                        ></path></svg
                                    >
                                </button>
                            </div>
                        {/each}
                    {/if}
                </div>
            </div>
        </div>
    </div>
{/if}
