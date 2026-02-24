<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { Trash } from "lucide-svelte";
	import { addAddon, getAddons, removeAddon, type Addon } from "../../../../lib/db/db";
	import { alertDialog, confirmDialog } from "../../../../lib/systemDialogs";
	import { trackEvent } from "../../../../lib/analytics";
	import LoadingSpinner from "../../../common/LoadingSpinner.svelte";
	import AddonLogo from "./AddonLogo.svelte";
	import {
		ADDONS_CHANGED_EVENT,
		HOME_REFRESH_EVENT,
		buildConfigureUrl,
		formatResourceName,
		getResourceNames,
		normalizeTransportUrl,
		supportsResource,
	} from "./addonsShared";

	let addonsList: Addon[] = [];
	let newAddonUrl = "";
	let loadingAddons = false;

	onMount(() => {
		void loadAddons();
		window.addEventListener(ADDONS_CHANGED_EVENT, handleAddonsChanged as EventListener);
	});

	onDestroy(() => {
		window.removeEventListener(ADDONS_CHANGED_EVENT, handleAddonsChanged as EventListener);
	});

	function handleAddonsChanged() {
		void loadAddons();
	}

	function emitAddonsChanged() {
		window.dispatchEvent(new CustomEvent(ADDONS_CHANGED_EVENT));
		window.dispatchEvent(new CustomEvent(HOME_REFRESH_EVENT));
	}

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

	async function handleAddAddon() {
		if (!newAddonUrl) return;
		if (!newAddonUrl.startsWith("http://") && !newAddonUrl.startsWith("https://")) {
			if (newAddonUrl.startsWith("stremio://")) {
				newAddonUrl = newAddonUrl.replace("stremio://", "https://");
			} else {
				await alertDialog("Invalid URL");
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
			await alertDialog("Invalid manifest");
			trackEvent("addon_custom_invalid_manifest");
			return;
		}

		try {
			await addAddon({
				transport_url: normalizeTransportUrl(newAddonUrl),
				manifest,
				flags: { protected: false, official: false },
				addon_id: crypto.randomUUID(),
			});
			newAddonUrl = "";
			await loadAddons();
			emitAddonsChanged();
			trackEvent("addon_custom_added", {
				has_stream: supportsResource(manifest, "stream"),
				has_subtitles: supportsResource(manifest, "subtitles"),
				has_catalog: supportsResource(manifest, "catalog"),
				has_meta: supportsResource(manifest, "meta"),
			});
		} catch (e) {
			console.error("Failed to add addon", e);
			await alertDialog("Failed to add addon");
			trackEvent("addon_custom_add_failed", {
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

	async function handleRemoveAddon(url: string) {
		if (!(await confirmDialog("Are you sure?", "Remove addon"))) return;
		try {
			await removeAddon(url);
			await loadAddons();
			emitAddonsChanged();
			trackEvent("addon_removed");
		} catch (e) {
			console.error("Failed to remove addon", e);
			trackEvent("addon_remove_failed", {
				error_name: e instanceof Error ? e.name : "unknown",
			});
		}
	}
</script>

<section class="rounded-[28px] bg-white/[0.04] p-5 md:p-6 flex flex-col gap-4 flex-1 min-h-0">
	<div class="flex flex-col gap-1">
		<h3 class="text-white text-xl font-semibold">Installed Addons</h3>
		<p class="text-white/60 text-sm">These sources are already available inside Raffi.</p>
	</div>

	<div class="flex-1 min-h-0 space-y-3 overflow-y-auto pr-1">
		{#if loadingAddons}
			<div class="flex justify-center py-6">
				<LoadingSpinner size="30px" />
			</div>
		{:else if addonsList.length === 0}
			<div class="text-white/50 text-center py-6 text-sm">No addons installed yet.</div>
		{:else}
			{#each addonsList as addon}
				{@const addonResources = getResourceNames(addon.manifest)}
				<div class="rounded-2xl bg-white/[0.08] p-4 flex items-center gap-4">
					<AddonLogo src={addon.manifest.logo} name={addon.manifest.name} sizeClass="w-12 h-12" />
					<div class="flex-1 min-w-0">
						<p class="text-white font-semibold truncate">{addon.manifest.name}</p>
						<p class="text-white/55 text-xs mt-1 line-clamp-1">
							{addonResources.length > 0
								? addonResources.map((name) => formatResourceName(name)).join(" • ")
								: "No declared resources"}
						</p>
					</div>
					<div class="flex gap-2">
						{#if addon.manifest.behaviorHints?.configurable}
							<button
								class="px-3 py-2 rounded-xl bg-white/[0.08] text-white/80 hover:text-white cursor-pointer"
								on:click={() => handleConfigure(addon.transport_url)}
							>
								Configure
							</button>
						{/if}
						<button
							class="text-red-400 hover:text-red-300 p-2 cursor-pointer"
							on:click={() => handleRemoveAddon(addon.transport_url)}
							aria-label="Remove addon"
						>
							<Trash size={20} strokeWidth={2} />
						</button>
					</div>
				</div>
			{/each}
		{/if}
	</div>

	<div class="pt-2 space-y-3">
		<p class="text-white/70 text-sm font-medium">Add custom addon</p>
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
