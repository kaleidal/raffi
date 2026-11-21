<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { ArrowDown, ArrowUp, Trash } from "@lucide/svelte";
	import { addAddon, getAddons, removeAddon, reorderAddons, type Addon } from "../../../lib/db/db";
	import { alertDialog, confirmDialog } from "../../../lib/shell/systemDialogs";
	import ShapeLoader from "../../common/loading/ShapeLoader.svelte";
	import AddonLogo from "./AddonLogo.svelte";
	import {
		ADDONS_CHANGED_EVENT,
		HOME_REFRESH_EVENT,
		openConfigureUrl,
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

	function addonSupportsStreams(addon: Addon) {
		return supportsResource(addon?.manifest, "stream");
	}

	function firstStreamAddonUrl(addons: Addon[]) {
		return addons.find((addon) => addonSupportsStreams(addon))?.transport_url ?? null;
	}

	async function loadAddons() {
		loadingAddons = true;
		addonsList = await getAddons();
		loadingAddons = false;
	}

	async function handleAddAddon() {
		if (!newAddonUrl) return;
		if (!newAddonUrl.startsWith("http://") && !newAddonUrl.startsWith("https://")) {
			if (newAddonUrl.startsWith("stremio://")) {
				newAddonUrl = newAddonUrl.replace("stremio://", "https://");
			} else {
				await alertDialog("Invalid URL");
				return;
			}
		}

		if (!newAddonUrl.endsWith("/manifest.json")) {
			newAddonUrl += "/manifest.json";
		}

		const manifest = await fetch(newAddonUrl)
			.then((response) => (response.ok ? response.json() : null))
			.catch(() => null);
		if (!manifest) {
			await alertDialog("Couldn't load an addon from that address");
			return;
		}

		await addAddon({
			transport_url: normalizeTransportUrl(newAddonUrl),
			manifest,
			flags: { protected: false, official: false },
			addon_id: crypto.randomUUID(),
		});
		newAddonUrl = "";
		await loadAddons();
		emitAddonsChanged();
	}

	function handleConfigure(url: string | undefined) {
		if (!openConfigureUrl(url)) return;
	}

	async function handleRemoveAddon(url: string) {
		if (!(await confirmDialog("Are you sure?", "Remove addon"))) return;
		await removeAddon(url);
		await loadAddons();
		emitAddonsChanged();
	}

	async function moveAddon(addon: Addon, direction: -1 | 1) {
		const currentIndex = addonsList.findIndex((item) => item.transport_url === addon.transport_url);
		if (currentIndex < 0) return;
		const targetIndex = currentIndex + direction;
		if (targetIndex < 0 || targetIndex >= addonsList.length) return;

		const next = [...addonsList];
		const [moved] = next.splice(currentIndex, 1);
		next.splice(targetIndex, 0, moved);
		addonsList = next.map((item, index) => ({ ...item, position: index + 1 }));

		await reorderAddons(addonsList.map((item) => item.transport_url));
		emitAddonsChanged();
	}
</script>

<section class="flex flex-col gap-1">
	<h3 class="text-lg font-semibold text-ink">Installed</h3>

	<div class="flex flex-col">
		{#if loadingAddons}
			<div class="flex justify-center py-6">
				<ShapeLoader size="30px" />
			</div>
		{:else if addonsList.length === 0}
			<div class="text-ink/50 text-center py-6 text-sm">No addons installed yet.</div>
		{:else}
			{#each addonsList as addon}
				{@const addonResources = getResourceNames(addon.manifest)}
				{@const isDefaultStreamAddon = firstStreamAddonUrl(addonsList) === addon.transport_url && addonSupportsStreams(addon)}
				<div class="flex items-center gap-4 py-3">
					<AddonLogo src={addon.manifest.logo} name={addon.manifest.name} sizeClass="w-12 h-12" />
					<div class="flex-1 min-w-0">
						<p class="text-ink font-semibold truncate">{addon.manifest.name}</p>
						<p class="text-ink/55 text-xs mt-1 line-clamp-1">
							{addonResources.length > 0
								? addonResources.map((name) => formatResourceName(name)).join(" • ")
								: "No declared resources"}
						</p>
						{#if isDefaultStreamAddon}
							<p class="mt-2 text-xs text-ink/70">Default stream source</p>
						{/if}
					</div>
					<div class="flex gap-2">
						<button
							class="px-2 py-2 rounded-full bg-ink/8 text-ink/80 hover:bg-ink/14 hover:text-ink cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
							on:click={() => moveAddon(addon, -1)}
							disabled={addonsList[0]?.transport_url === addon.transport_url}
							aria-label="Move addon up"
						>
							<ArrowUp size={18} strokeWidth={2} />
						</button>
						<button
							class="px-2 py-2 rounded-full bg-ink/8 text-ink/80 hover:bg-ink/14 hover:text-ink cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
							on:click={() => moveAddon(addon, 1)}
							disabled={addonsList[addonsList.length - 1]?.transport_url === addon.transport_url}
							aria-label="Move addon down"
						>
							<ArrowDown size={18} strokeWidth={2} />
						</button>
						{#if addon.manifest.behaviorHints?.configurable}
							<button
								class="px-3 py-2 rounded-full bg-ink/8 text-ink/80 hover:bg-ink/14 hover:text-ink cursor-pointer"
								on:click={() => handleConfigure(addon.transport_url)}
							>
								Configure
							</button>
						{/if}
						<button
							class="text-danger hover:text-danger p-2 cursor-pointer"
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

	<div class="pt-3">
		<div class="flex flex-col gap-3 sm:flex-row">
			<input
				type="text"
				placeholder="Paste an addon link"
				class="min-w-0 flex-1 rounded-full bg-ink/8 px-5 py-3 text-ink outline-none placeholder:text-ink/40 focus:bg-ink/12"
				bind:value={newAddonUrl}
			/>
			<button
				class="bg-accent text-on-accent px-6 py-3 rounded-full font-semibold hover:bg-accent/85 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
				on:click={handleAddAddon}
				disabled={!newAddonUrl}
			>
				Add
			</button>
		</div>
	</div>
</section>
