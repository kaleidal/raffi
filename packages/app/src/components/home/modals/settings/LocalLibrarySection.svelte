<script lang="ts">
	import { onMount } from "svelte";
	import {
		getRoots as getLocalRoots,
		removeRoot,
		scanAndIndex,
	} from "../../../../lib/localLibrary/localLibrary";

	let localLibrarySupported = false;
	let localRoots: string[] = [];
	let scanningLocal = false;
	let localScanMessage = "";

	onMount(async () => {
		localLibrarySupported =
			typeof window !== "undefined" &&
			!!(window as any).electronAPI?.localLibrary;
		if (localLibrarySupported) {
			localRoots = await getLocalRoots();
		}
	});

	async function addLocalFolder() {
		if (!localLibrarySupported) return;
		localScanMessage = "";
		try {
			const picked = await (window as any).electronAPI.localLibrary.pickFolder();
			if (!picked) return;
			localRoots = await getLocalRoots();
		} catch (e) {
			console.error("Failed to pick folder", e);
			localScanMessage = "Failed to pick folder";
		}
	}

	async function removeLocalFolder(folder: string) {
		await removeRoot(folder);
		localRoots = await getLocalRoots();
	}

	async function rescanLocalLibrary() {
		if (!localLibrarySupported) return;
		scanningLocal = true;
		localScanMessage = "Scanning…";
		try {
			const res = await scanAndIndex();
			localScanMessage = res ? `Indexed ${res.entries} files` : "Not available";
		} catch (e) {
			console.error("Local library scan failed", e);
			localScanMessage = "Scan failed";
		} finally {
			scanningLocal = false;
		}
	}
</script>

{#if localLibrarySupported}
<section class="rounded-[28px] bg-white/[0.04] p-6 flex flex-col gap-5">
	<div>
		<h3 class="text-white text-xl font-semibold">Local Library</h3>
		<p class="text-white/60 text-sm">
			Add a folder and Raffi will recognize files like S01E01 and offer them as “Local” streams.
		</p>
	</div>

	<div class="rounded-2xl bg-white/[0.08] p-5 flex flex-col gap-4">
		<div class="flex flex-wrap gap-3 items-center justify-between">
			<button
				class="bg-white text-black px-5 py-3 rounded-2xl font-semibold hover:bg-white/90 transition-colors cursor-pointer"
				on:click={addLocalFolder}
			>
				Add Folder
			</button>
			<button
				class={`px-5 py-3 rounded-2xl font-semibold transition-colors cursor-pointer ${scanningLocal ? 'bg-white/20 text-white/60' : 'bg-white/10 text-white hover:bg-white/20'}`}
				on:click={rescanLocalLibrary}
				disabled={scanningLocal}
			>
				Rescan
			</button>
		</div>

		{#if localScanMessage}
			<p class="text-white/60 text-sm">{localScanMessage}</p>
		{/if}

		{#if localRoots.length === 0}
			<p class="text-white/50 text-sm">No folders added yet.</p>
		{:else}
			<div class="flex flex-col gap-2">
				{#each localRoots as folder (folder)}
					<div class="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.06] px-4 py-3">
						<p class="text-white/80 text-sm break-all">{folder}</p>
						<button
							class="text-white/50 hover:text-white transition-colors cursor-pointer"
							on:click={() => removeLocalFolder(folder)}
							aria-label="Remove folder"
						>
							Remove
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</section>
{/if}
