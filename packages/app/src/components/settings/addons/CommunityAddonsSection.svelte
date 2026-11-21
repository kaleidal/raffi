<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { addAddon, getAddons } from "../../../lib/db/db";
	import { hostFetch } from "../../../lib/shell/hostFetch";
	import { alertDialog } from "../../../lib/shell/systemDialogs";
	import LoadingSpinner from "../../common/loading/LoadingSpinner.svelte";
	import AddonLogo from "./AddonLogo.svelte";
	import {
		ADDONS_CHANGED_EVENT,
		HOME_REFRESH_EVENT,
		hasSupportedResource,
		isUuid,
		normalizeTransportUrl,
		supportsResource,
		openConfigureUrl,
		RESOURCE_LABELS,
		SUPPORTED_RESOURCES,
		formatResourceName,
		getResourceNames,
	} from "./addonsShared";

	type ResourceFilter = "all" | "stream" | "subtitles" | "catalog" | "meta";

	const resourceSummary = (manifest: any) =>
		getResourceNames(manifest)
			.filter((name) => SUPPORTED_RESOURCES.has(name))
			.map(formatResourceName)
			.join(" · ");
	export let initialResourceFilter: ResourceFilter = "all";

	let loadingCommunity = false;
	let communityAddons: any[] = [];
	let communitySearch = "";
	let communityResourceFilter: ResourceFilter = initialResourceFilter;
	let appliedInitialResourceFilter: ResourceFilter = initialResourceFilter;
	const filterOptions: ResourceFilter[] = [
		"all",
		"stream",
		"subtitles",
		"catalog",
		"meta",
	];
	let installedTransportUrls = new Set<string>();

	onMount(() => {
		void loadInstalledAddons();
		void loadCommunityAddons();
		window.addEventListener(ADDONS_CHANGED_EVENT, handleAddonsChanged as EventListener);
	});

	onDestroy(() => {
		window.removeEventListener(ADDONS_CHANGED_EVENT, handleAddonsChanged as EventListener);
	});

	function handleAddonsChanged() {
		void loadInstalledAddons();
	}

	$: if (
		initialResourceFilter !== appliedInitialResourceFilter &&
		filterOptions.includes(initialResourceFilter)
	) {
		communityResourceFilter = initialResourceFilter;
		appliedInitialResourceFilter = initialResourceFilter;
	}

	function emitAddonsChanged() {
		window.dispatchEvent(new CustomEvent(ADDONS_CHANGED_EVENT));
		window.dispatchEvent(new CustomEvent(HOME_REFRESH_EVENT));
	}

	async function loadInstalledAddons() {
		const addonsList = await getAddons();
		installedTransportUrls = new Set(
			addonsList.map((addon) => normalizeTransportUrl(addon.transport_url)),
		);
	}

	async function loadCommunityAddons() {
		loadingCommunity = true;
		try {
			let combined: any[] = [];

			if (window.electronAPI?.fetchCommunityAddons) {
				const result = await window.electronAPI.fetchCommunityAddons();
				if (result?.ok && Array.isArray(result.addons)) {
					combined = result.addons;
				} else if (result?.error) {
					throw new Error(result.error);
				}
			} else {
				const endpoints = [
					"https://api.strem.io/addonscollection.json",
					"https://stremio-addons.com/catalog.json",
				];
				for (const endpoint of endpoints) {
					try {
						const response = await hostFetch(endpoint, {
							headers: { Accept: "application/json" },
						});
						if (!response.ok) continue;
						const json = await response.json();
						if (Array.isArray(json)) combined.push(...json);
					} catch (innerError) {
						console.warn("Community endpoint failed", endpoint, innerError);
					}
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
		} catch (e) {
			console.error("Failed to load community addons", e);
			communityAddons = [];
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
		} catch (e) {
			console.error("Failed to install community addon", e);
			await alertDialog("Failed to install addon");
		}
	}

	function handleConfigure(url: string | undefined) {
		if (!openConfigureUrl(url)) return;
	}

	function handleCommunitySearchInput(event: Event) {
		communitySearch = (event.target as HTMLInputElement).value;
	}

	function setCommunityFilter(next: ResourceFilter) {
		if (communityResourceFilter === next) return;
		communityResourceFilter = next;
	}

	function handleFilterClick(filter: ResourceFilter) {
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

<section class="flex flex-col gap-4">
	<h3 class="text-lg font-semibold text-ink">Find more</h3>

	<div>
		<input
			type="text"
			placeholder="Search addons"
			class="w-full rounded-full bg-ink/8 px-5 py-3 text-ink outline-none placeholder:text-ink/40 focus:bg-ink/12"
			on:input={handleCommunitySearchInput}
			bind:value={communitySearch}
		/>
	</div>

	<div class="flex flex-wrap gap-2">
		{#each filterOptions as filter}
			<button
				class={`px-4 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer ${
					communityResourceFilter === filter
						? "bg-accent text-on-accent"
						: "bg-ink/10 text-ink/70 hover:text-ink"
				}`}
				on:click={() => handleFilterClick(filter)}
			>
				{filter === "all" ? "All" : RESOURCE_LABELS[filter]}
			</button>
		{/each}
	</div>

	<div class="flex flex-col">
		{#if loadingCommunity}
			<div class="flex justify-center py-6">
				<LoadingSpinner size="40px" />
			</div>
		{:else if filteredCommunityAddons.length === 0}
			<div class="text-ink/50 text-center py-6 text-sm">
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
				<div class="flex items-center gap-4 py-3.5">
					<div class="flex min-w-0 flex-1 gap-4">
						<AddonLogo src={logoUrl} name={addon.manifest.name} sizeClass="w-12 h-12" />
						<div class="flex-1 min-w-0">
							<p class="text-ink font-semibold truncate">{addon.manifest.name}</p>
							{#if addon.manifest.description}
								<p class="text-ink/60 text-sm line-clamp-2">{addon.manifest.description}</p>
							{/if}
							<p class="mt-1 text-xs text-ink/45">{resourceSummary(addon.manifest)}</p>
						</div>
					</div>

					<div class="flex shrink-0 flex-wrap justify-end gap-2">
						{#if addon.manifest.behaviorHints?.configurable}
							<button
								class="px-4 py-2 rounded-full bg-ink/8 text-ink/80 hover:bg-ink/14 hover:text-ink cursor-pointer"
								on:click={() => handleConfigure(transportUrl)}
							>
								Configure
							</button>
						{/if}
						<button
							class={`px-4 py-2 rounded-full font-semibold cursor-pointer ${
								installed ? "bg-ink/15 text-ink/40 cursor-not-allowed" : "bg-accent text-on-accent hover:bg-accent/85"
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
