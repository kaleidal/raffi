<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { serverUrl } from "../../../../lib/client";
	import { addAddon, getAddons } from "../../../../lib/db/db";
	import { trackEvent } from "../../../../lib/analytics";
	import { alertDialog } from "../../../../lib/systemDialogs";
	import LoadingSpinner from "../../../common/LoadingSpinner.svelte";
	import AddonLogo from "./AddonLogo.svelte";
	import {
		ADDONS_CHANGED_EVENT,
		HOME_REFRESH_EVENT,
		hasSupportedResource,
		isUuid,
		normalizeTransportUrl,
		supportsResource,
		buildConfigureUrl,
	} from "./addonsShared";

	let loadingCommunity = false;
	let communityAddons: any[] = [];
	let communitySearch = "";
	let communityResourceFilter: "all" | "stream" | "subtitles" | "catalog" | "meta" = "all";
	const filterOptions: Array<"all" | "stream" | "subtitles" | "catalog" | "meta"> = [
		"all",
		"stream",
		"subtitles",
		"catalog",
		"meta",
	];
	let communitySearchTimeout: ReturnType<typeof setTimeout> | undefined;
	let installedTransportUrls = new Set<string>();

	const COMMUNITY_ENDPOINTS = [
		`${serverUrl}/community-addons`
	];

	onMount(() => {
		void loadInstalledAddons();
		void loadCommunityAddons();
		window.addEventListener(ADDONS_CHANGED_EVENT, handleAddonsChanged as EventListener);
	});

	onDestroy(() => {
		window.removeEventListener(ADDONS_CHANGED_EVENT, handleAddonsChanged as EventListener);
		if (communitySearchTimeout) clearTimeout(communitySearchTimeout);
	});

	function handleAddonsChanged() {
		void loadInstalledAddons();
	}

	function emitAddonsChanged() {
		window.dispatchEvent(new CustomEvent(ADDONS_CHANGED_EVENT));
		window.dispatchEvent(new CustomEvent(HOME_REFRESH_EVENT));
	}

	async function loadInstalledAddons() {
		try {
			const addonsList = await getAddons();
			installedTransportUrls = new Set(
				addonsList.map((addon) => normalizeTransportUrl(addon.transport_url)),
			);
		} catch (e) {
			console.error("Failed to load installed addons", e);
		}
	}

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

	async function installCommunityAddon(addon: any) {
		try {
			const manifestId = addon?.manifest?.id;
			await addAddon({
				transport_url: normalizeTransportUrl(addon.transportUrl ?? addon.transport_url),
				manifest: addon.manifest,
				flags: { protected: false, official: false },
				addon_id: isUuid(manifestId) ? manifestId : crypto.randomUUID(),
			});
			emitAddonsChanged();
			await loadInstalledAddons();
			trackEvent("addon_community_installed", {
				has_stream: supportsResource(addon?.manifest, "stream"),
				has_subtitles: supportsResource(addon?.manifest, "subtitles"),
				has_catalog: supportsResource(addon?.manifest, "catalog"),
				has_meta: supportsResource(addon?.manifest, "meta"),
				configurable: Boolean(addon?.manifest?.behaviorHints?.configurable),
			});
		} catch (e) {
			console.error("Failed to install community addon", e);
			await alertDialog("Failed to install addon");
			trackEvent("addon_community_install_failed", {
				error_name: e instanceof Error ? e.name : "unknown",
			});
		}
	}

	function handleConfigure(url: string | undefined) {
		const target = buildConfigureUrl(url);
		if (!target) return;
		trackEvent("addon_configure_opened");
		window.open(target, "_blank", "noopener,noreferrer");
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

	function setCommunityFilter(next: "all" | "stream" | "subtitles" | "catalog" | "meta") {
		if (communityResourceFilter === next) return;
		communityResourceFilter = next;
		trackEvent("community_addon_filter_changed", { filter: next });
	}

	function handleFilterClick(filter: "all" | "stream" | "subtitles" | "catalog" | "meta") {
		setCommunityFilter(filter);
	}

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
		{#each filterOptions as filter}
			<button
				class={`px-3 py-2 rounded-full text-s font-semibold uppercase transition-colors ${
					communityResourceFilter === filter
						? "bg-white text-black"
						: "bg-white/10 text-white/70 hover:text-white"
				}`}
				on:click={() => handleFilterClick(filter)}
			>
				{filter === "meta" ? "Metadata" : filter === "all" ? "All" : filter}
			</button>
		{/each}
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
						<AddonLogo src={logoUrl} name={addon.manifest.name} sizeClass="w-14 h-14" />
						<div class="flex-1 min-w-0">
							<p class="text-white font-semibold truncate">{addon.manifest.name}</p>
							{#if addon.manifest.description}
								<p class="text-white/60 text-sm line-clamp-2">{addon.manifest.description}</p>
							{/if}
						</div>
					</div>

					<div class="flex flex-wrap gap-2 text-[13px] uppercase text-white/70 font-medium">
						{#if supportsResource(addon.manifest, "stream")}
							<span class="px-2 py-1 rounded-full bg-white/15">Streams</span>
						{/if}
						{#if supportsResource(addon.manifest, "subtitles")}
							<span class="px-2 py-1 rounded-full bg-white/15">Subtitles</span>
						{/if}
						{#if supportsResource(addon.manifest, "catalog")}
							<span class="px-2 py-1 rounded-full bg-white/15">Catalogs</span>
						{/if}
						{#if supportsResource(addon.manifest, "meta")}
							<span class="px-2 py-1 rounded-full bg-white/15">Metadata</span>
						{/if}
						{#if addon.manifest.behaviorHints?.configurable}
							<span class="px-2 py-1 rounded-full bg-white/10">Configurable</span>
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
								installed ? "bg-white/15 text-white/40 cursor-not-allowed" : "bg-white text-black hover:bg-white/90"
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
