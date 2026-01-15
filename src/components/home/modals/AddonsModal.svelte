<script lang="ts">
    import { fade, scale } from "svelte/transition";
    import { onDestroy } from "svelte";

    import { getAddons, addAddon, removeAddon } from "../../../lib/db/db";
    import type { Addon } from "../../../lib/db/db";
    import { serverUrl } from "../../../lib/client";
    import LoadingSpinner from "../../common/LoadingSpinner.svelte";
    import { trackEvent } from "../../../lib/analytics";


    export let showAddonsModal = false;

    let addonsList: Addon[] = [];
    let bodyLocked = false;

    let newAddonUrl = "";
    let loadingAddons = false;
    let communityAddons: any[] = [];
    let loadingCommunity = false;
    let communitySearch = "";
    let communityResourceFilter: "all" | "stream" | "subtitles" = "all";
    let hasTrackedOpen = false;
    let communitySearchTimeout: any;


    const COMMUNITY_ENDPOINTS = [
        `${serverUrl}/community-addons`,
        "https://api.strem.io/addonscollection.json",
        "https://stremio-addons.com/catalog.json"
    ];
    const SUPPORTED_RESOURCES = new Set(["stream", "subtitles"]);

    const normalizeTransportUrl = (url: string) =>
        url.endsWith("/manifest.json")
            ? url.replace(/\/manifest\.json$/i, "")
            : url;

    const matchesResource = (manifest: any, predicate: (name: string) => boolean) => {
        const resources = manifest?.resources ?? [];
        return resources.some((resource: any) => {
            if (typeof resource === "string") {
                return predicate(resource);
            }
            if (resource && typeof resource === "object") {
                return predicate(resource.name);
            }
            return false;
        });
    };

    const hasSupportedResource = (manifest: any) =>
        matchesResource(manifest, (name) => SUPPORTED_RESOURCES.has(name));

    const supportsResource = (manifest: any, target: "stream" | "subtitles") =>
        matchesResource(manifest, (name) => name === target);

    const isUuid = (value: unknown): value is string => {
        if (typeof value !== "string") return false;
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            value,
        );
    };

    async function loadAddons() {
        loadingAddons = true;
        try {
            addonsList = await getAddons();
            trackEvent("addons_loaded", { installed_count: addonsList.length });
        } catch (e) {
            console.error("Failed to load addons", e);
            trackEvent("addons_load_failed", {
                error_name: e instanceof Error ? e.name : "unknown",
            });
        } finally {
            loadingAddons = false;
        }
    }

    const toggleBodyScroll = (active: boolean) => {
        if (typeof document === "undefined") return;
        const body = document.body;
        const html = document.documentElement;
        const container = document.querySelector(
            "[data-scroll-container]",
        ) as HTMLElement | null;
        const count = Number(body.dataset.modalCount || "0");
        if (active) {
            if (count === 0) {
                const scrollY = window.scrollY;
                body.dataset.scrollY = String(scrollY);
                body.dataset.prevOverflow = body.style.overflow || "";
                body.dataset.prevPosition = body.style.position || "";
                body.dataset.prevTop = body.style.top || "";
                body.dataset.prevWidth = body.style.width || "";
                body.style.overflow = "hidden";
                body.style.position = "fixed";
                body.style.top = `-${scrollY}px`;
                body.style.width = "100%";
                html.style.overflow = "hidden";
                if (container) {
                    container.dataset.prevOverflow = container.style.overflow || "";
                    container.style.overflow = "hidden";
                }
            }
            body.dataset.modalCount = String(count + 1);
            return;
        }
        const next = Math.max(0, count - 1);
        body.dataset.modalCount = String(next);
        if (next === 0) {
            const scrollY = Number(body.dataset.scrollY || "0");
            body.style.overflow = body.dataset.prevOverflow || "";
            body.style.position = body.dataset.prevPosition || "";
            body.style.top = body.dataset.prevTop || "";
            body.style.width = body.dataset.prevWidth || "";
            html.style.overflow = "";
            delete body.dataset.prevOverflow;
            delete body.dataset.prevPosition;
            delete body.dataset.prevTop;
            delete body.dataset.prevWidth;
            delete body.dataset.scrollY;
            if (container) {
                container.style.overflow = container.dataset.prevOverflow || "";
                delete container.dataset.prevOverflow;
            }
            window.scrollTo(0, scrollY);
        }
    };

    const updateBodyLock = (active: boolean) => {
        if (active && !bodyLocked) {
            toggleBodyScroll(true);
            bodyLocked = true;
        } else if (!active && bodyLocked) {
            toggleBodyScroll(false);
            bodyLocked = false;
        }
    };

    async function loadCommunityAddons() {
        loadingCommunity = true;
        try {
            const combined: any[] = [];
            for (const endpoint of COMMUNITY_ENDPOINTS) {
                try {
                    const response = await fetch(endpoint, {
                        headers: { Accept: "application/json" },
                    });
                    if (!response.ok) continue;
                    const json = await response.json();
                    if (Array.isArray(json)) {
                        combined.push(...json);
                    }
                } catch (innerError) {
                    console.warn("Community endpoint failed", endpoint, innerError);
                }
            }
            if (combined.length === 0) throw new Error("All community endpoints failed");

            const deduped = new Map<string, any>();
            for (const addon of combined) {
                const transportUrl = addon?.transportUrl ?? addon?.transport_url ?? "";
                const transportKey = transportUrl ? normalizeTransportUrl(String(transportUrl)) : "";
                const idKey = addon?.manifest?.id ? String(addon.manifest.id) : "";
                const key = transportKey || idKey;
                if (!key) continue;
                if (!deduped.has(key)) deduped.set(key, addon);
            }

            communityAddons = Array.from(deduped.values()).filter((addon: any) =>
                hasSupportedResource(addon?.manifest),
            );
            trackEvent("community_addons_loaded", {
                count: communityAddons.length,
                endpoints: COMMUNITY_ENDPOINTS.length,
            });
        } catch (e) {
            console.error("Failed to load community addons", e);
            communityAddons = [];
            trackEvent("community_addons_load_failed", {
                error_name: e instanceof Error ? e.name : "unknown",
            });
        } finally {
            loadingCommunity = false;
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
                trackEvent("addon_custom_invalid_url");
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
            trackEvent("addon_custom_invalid_manifest");
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
            trackEvent("addon_custom_added", {
                has_stream: supportsResource(manifest, "stream"),
                has_subtitles: supportsResource(manifest, "subtitles"),
            });
        } catch (e) {
            console.error("Failed to add addon", e);
            alert("Failed to add addon");
            trackEvent("addon_custom_add_failed", {
                error_name: e instanceof Error ? e.name : "unknown",
            });
        }
    }

    async function installCommunityAddon(addon: any) {
        try {
            const manifestId = addon?.manifest?.id;
            await addAddon({
                transport_url: normalizeTransportUrl(addon.transportUrl ?? addon.transport_url),
                manifest: addon.manifest,
                flags: { protected: false, official: false },
                // DB column is a UUID; many community manifest ids are not UUIDs (e.g. "stremio.addons...|...").
                addon_id: isUuid(manifestId) ? manifestId : crypto.randomUUID(),
            });
            await loadAddons();
            trackEvent("addon_community_installed", {
                has_stream: supportsResource(addon?.manifest, "stream"),
                has_subtitles: supportsResource(addon?.manifest, "subtitles"),
                configurable: Boolean(addon?.manifest?.behaviorHints?.configurable),
            });
        } catch (e) {
            console.error("Failed to install community addon", e);
            alert("Failed to install addon");
            trackEvent("addon_community_install_failed", {
                error_name: e instanceof Error ? e.name : "unknown",
            });
        }
    }


    const buildConfigureUrl = (url: string | undefined) => {
        if (!url) return null;
        const trimmed = url.trim();
        if (!trimmed) return null;
        if (/manifest\.json\/?$/i.test(trimmed)) {
            return trimmed.replace(/manifest\.json\/?$/i, "configure");
        }
        if (trimmed.endsWith("/configure")) return trimmed;
        return `${trimmed.replace(/\/$/, "")}/configure`;
    };

    function handleConfigure(url: string | undefined) {
        const target = buildConfigureUrl(url);
        if (!target) return;
        trackEvent("addon_configure_opened");
        window.open(target, "_blank", "noopener,noreferrer");
    }

    async function handleRemoveAddon(url: string) {
        if (!confirm("Are you sure?")) return;
        try {
            await removeAddon(url);
            await loadAddons();
            trackEvent("addon_removed");
        } catch (e) {
            console.error("Failed to remove addon", e);
            trackEvent("addon_remove_failed", {
                error_name: e instanceof Error ? e.name : "unknown",
            });
        }
    }

    function handleCommunitySearchInput(event: Event) {
        const value = (event.target as HTMLInputElement).value;
        communitySearch = value;
        if (communitySearchTimeout) clearTimeout(communitySearchTimeout);
        communitySearchTimeout = setTimeout(() => {
            const queryLength = value.trim().length;
            trackEvent("community_addon_search", { query_length: queryLength });
        }, 500);
    }

    function setCommunityFilter(next: "all" | "stream" | "subtitles") {
        if (communityResourceFilter === next) return;
        communityResourceFilter = next;
        trackEvent("community_addon_filter_changed", { filter: next });
    }

    function closeModal() {
        trackEvent("addons_modal_closed");
        showAddonsModal = false;
    }

    $: if (showAddonsModal) {
        loadAddons();
        loadCommunityAddons();
    }

    $: updateBodyLock(showAddonsModal);

    onDestroy(() => {
        updateBodyLock(false);
    });

    $: if (showAddonsModal && !hasTrackedOpen) {
        hasTrackedOpen = true;
        trackEvent("addons_modal_opened");
    }

    $: if (!showAddonsModal && hasTrackedOpen) {
        hasTrackedOpen = false;
    }


    $: installedTransportUrls = new Set(
        addonsList.map((addon) => normalizeTransportUrl(addon.transport_url)),
    );

    $: filteredCommunityAddons = communityAddons.filter((addon: any) => {
        const manifest = addon?.manifest ?? {};

        if (communityResourceFilter !== "all") {
            if (!supportsResource(manifest, communityResourceFilter)) return false;
        }

        const q = String(communitySearch ?? "").trim().toLowerCase();
        if (!q) return true;
        const name = String(manifest?.name ?? "").toLowerCase();
        const description = String(manifest?.description ?? "").toLowerCase();
        const id = String(manifest?.id ?? "").toLowerCase();
        const transportUrl = String(addon?.transportUrl ?? addon?.transport_url ?? "").toLowerCase();
        return (
            name.includes(q) ||
            description.includes(q) ||
            id.includes(q) ||
            transportUrl.includes(q)
        );
    });
</script>

{#if showAddonsModal}
    <div
        class="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex"
        transition:fade={{ duration: 200 }}
        on:click|self={closeModal}
        on:keydown={(e) => e.key === "Escape" && closeModal()}
        on:wheel|preventDefault|stopPropagation
        role="button"
        tabindex="0"
        style="padding: clamp(20px, 5vw, 150px);"
    >

        <div
            class="bg-[#121212] w-full h-full rounded-[32px] p-6 md:p-10 flex flex-col gap-6 relative overflow-hidden shadow-[0_40px_160px_rgba(0,0,0,0.55)]"
            transition:scale={{ start: 0.95, duration: 200 }}
            on:wheel|stopPropagation
        >

            <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 class="text-white text-3xl font-poppins font-bold">
                        Manage Addons
                    </h2>
                    <p class="text-white/60 text-sm">
                        Combine community streams/subtitles with your installed sources.
                    </p>
                </div>
                <button
                    class="self-end text-white/50 hover:text-white cursor-pointer"
                    on:click={closeModal}
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

            <div class="flex-1 min-h-0">
                <div class="flex h-full flex-col gap-6 overflow-hidden lg:flex-row lg:gap-8">
                    <section class="rounded-[28px] bg-white/[0.04] p-5 md:p-6 flex flex-col gap-4 flex-1 min-h-0">
                        <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-3 flex-wrap">
                            <h3 class="text-white text-xl font-semibold">
                                Community Addons
                            </h3>
                        </div>
                        <p class="text-white/60 text-sm">
                            Browse and install addons shared by the community.
                        </p>
                    </div>

                        <div class="pt-1">
                            <input
                                type="text"
                                placeholder="Search community addons"
                                class="w-full bg-white/5 rounded-xl px-4 py-3 text-white outline-none focus:border-white/30"
                                on:input={handleCommunitySearchInput}
                                bind:value={communitySearch}
                            />

                        </div>

                        <div class="flex flex-wrap gap-2">
                            <button
                                class={`px-3 py-2 rounded-full text-xs font-semibold tracking-[0.18em] uppercase transition-colors ${
                                    communityResourceFilter === "all"
                                        ? "bg-white text-black"
                                        : "bg-white/10 text-white/70 hover:text-white"
                                }`}
                                on:click={() => setCommunityFilter("all")}

                            >
                                All
                            </button>
                            <button
                                class={`px-3 py-2 rounded-full text-xs font-semibold tracking-[0.18em] uppercase transition-colors ${
                                    communityResourceFilter === "stream"
                                        ? "bg-white text-black"
                                        : "bg-white/10 text-white/70 hover:text-white"
                                }`}
                                on:click={() => setCommunityFilter("stream")}

                            >
                                Streams
                            </button>
                            <button
                                class={`px-3 py-2 rounded-full text-xs font-semibold tracking-[0.18em] uppercase transition-colors ${
                                    communityResourceFilter === "subtitles"
                                        ? "bg-white text-black"
                                        : "bg-white/10 text-white/70 hover:text-white"
                                }`}
                                on:click={() => setCommunityFilter("subtitles")}

                            >
                                Subtitles
                            </button>
                        </div>

                        <div class="flex-1 min-h-0 space-y-3 overflow-y-auto pr-1">
                        {#if loadingCommunity}
                            <div class="flex justify-center py-6">
                                <LoadingSpinner size="40px" />
                            </div>
                        {:else if filteredCommunityAddons.length === 0}
                            <div class="text-white/50 text-center py-6 text-sm">
                                {communitySearch.trim().length || communityResourceFilter !== "all"
                                    ? "No matching addons found."
                                    : "No community addons found."}
                            </div>
                        {:else}
                            {#each filteredCommunityAddons as addon}
                                {@const transportUrl = addon.transportUrl ?? addon.transport_url}
                                {@const transportBase = normalizeTransportUrl(transportUrl)}
                                {@const installed = installedTransportUrls.has(transportBase)}
                                {@const logoUrl = addon.manifest?.logo ?? addon.manifest?.icon}
                                <div class="rounded-2xl bg-white/[0.08] p-4 flex flex-col gap-3">
                                    <div class="flex gap-3">
                                        {#if logoUrl}
                                            <img
                                                src={logoUrl}
                                                alt="{addon.manifest.name} logo"
                                                class="w-14 h-14 object-contain rounded-xl bg-white/5"
                                            />
                                        {/if}
                                        <div class="flex-1 min-w-0">
                                            <p class="text-white font-semibold truncate">
                                                {addon.manifest.name}
                                            </p>
                                            {#if addon.manifest.description}
                                                <p class="text-white/60 text-sm line-clamp-2">
                                                    {addon.manifest.description}
                                                </p>
                                            {/if}
                                        </div>
                                    </div>

                                    <div class="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.2em] text-white/50">
                                        {#if supportsResource(addon.manifest, "stream")}
                                            <span class="px-2 py-1 rounded-full bg-white/15 text-white/90">
                                                Streams
                                            </span>
                                        {/if}
                                        {#if supportsResource(addon.manifest, "subtitles")}
                                            <span class="px-2 py-1 rounded-full bg-white/15 text-white/90">
                                                Subtitles
                                            </span>
                                        {/if}
                                        {#if addon.manifest.behaviorHints?.configurable}
                                            <span class="px-2 py-1 rounded-full bg-white/10 text-white/80">
                                                Configurable
                                            </span>
                                        {/if}
                                    </div>

                                    <div class="flex flex-wrap gap-2 justify-end">
                                        {#if addon.manifest.behaviorHints?.configurable}
                                            <button
                                                class="px-4 py-2 rounded-xl bg-white/[0.08] text-white/80 hover:text-white cursor-pointer"
                                                on:click={() => handleConfigure(transportUrl)}
                                            >
                                                Configure
                                            </button>
                                        {/if}
                                        <button
                                            class={`px-4 py-2 rounded-xl font-semibold cursor-pointer ${
                                                installed
                                                        ? "bg-white/15 text-white/40 cursor-not-allowed"
                                                    : "bg-white text-black hover:bg-white/90"
                                            }`}
                                            on:click={() => installCommunityAddon(addon)}
                                            disabled={installed}
                                        >
                                            {installed ? "Installed" : "Install"}
                                        </button>
                                    </div>
                                </div>
                            {/each}
                        {/if}
                        </div>
                    </section>

                    <section class="rounded-[28px] bg-white/[0.04] p-5 md:p-6 flex flex-col gap-4 flex-1 min-h-0">
                        <div class="flex flex-col gap-1">
                        <h3 class="text-white text-xl font-semibold">
                            Installed Addons
                        </h3>
                        <p class="text-white/60 text-sm">
                            These sources are already available inside Raffi.
                        </p>
                    </div>

                        <div class="flex-1 min-h-0 space-y-3 overflow-y-auto pr-1">
                        {#if loadingAddons}
                            <div class="flex justify-center py-6">
                                <LoadingSpinner size="30px" />
                            </div>
                        {:else if addonsList.length === 0}
                            <div class="text-white/50 text-center py-6 text-sm">
                                No addons installed yet.
                            </div>
                        {:else}
                            {#each addonsList as addon}
                                <div class="rounded-2xl bg-white/[0.08] p-4 flex items-center gap-4">
                                    {#if addon.manifest.logo}
                                        <img
                                            src={addon.manifest.logo}
                                            alt="{addon.manifest.name} logo"
                                            class="w-12 h-12 object-contain rounded-xl bg-white/5"
                                        />
                                    {/if}
                                    <div class="flex-1 min-w-0">
                                        <p class="text-white font-semibold truncate">
                                            {addon.manifest.name}
                                        </p>
                                    </div>
                                    <div class="flex gap-2">
                                        {#if addon.manifest.behaviorHints?.configurable}
                                            <button
                                                class="px-3 py-2 rounded-xl bg-white/[0.08] text-white/80 hover:text-white cursor-pointer"
                                                on:click={() =>
                                                    handleConfigure(addon.transport_url)}
                                            >
                                                Configure
                                            </button>
                                        {/if}
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
                                </div>
                            {/each}
                        {/if}
                        </div>

                        <div class="pt-2 space-y-3">
                            <p class="text-white/70 text-sm font-medium">
                                Add custom addon
                            </p>
                            <div class="flex flex-col gap-3 sm:flex-row">
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
                        </div>
                    </section>
                </div>
            </div>
        </div>
    </div>
{/if}
