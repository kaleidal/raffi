<script lang="ts">
	import { onMount } from "svelte";
	import {
		getRoots as getLocalRoots,
		removeRoot,
		scanAndIndex,
	} from "../../../lib/library/localLibrary";

	let localRoots: string[] = [];
	let scanningLocal = false;
	let localScanMessage = "";

	onMount(async () => {
		localRoots = await getLocalRoots();
	});

	async function addLocalFolder() {
		localScanMessage = "";
		try {
			const picked = await window.electronAPI?.localLibrary?.pickFolder();
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

<p class="max-w-xl pb-2 text-sm text-ink/55">
	Raffi recognizes files named like S01E01 in these folders and offers them as Local streams.
</p>

{#each localRoots as folder (folder)}
	<div class="flex items-center justify-between gap-4 py-2.5">
		<p class="min-w-0 break-all text-sm text-ink/80">{folder}</p>
		<button
			class="shrink-0 cursor-pointer text-sm text-ink/50 transition-colors hover:text-danger"
			on:click={() => removeLocalFolder(folder)}
		>
			Remove
		</button>
	</div>
{:else}
	<p class="py-2.5 text-sm text-ink/45">No folders yet.</p>
{/each}

<div class="flex flex-wrap items-center gap-3 pt-4">
	<button
		class="cursor-pointer rounded-full bg-accent px-5 py-2.5 font-semibold text-on-accent transition-colors hover:bg-accent/85"
		on:click={addLocalFolder}
	>
		Add folder
	</button>
	<button
		class="cursor-pointer rounded-full bg-ink/10 px-5 py-2.5 font-semibold text-ink transition-colors hover:bg-ink/16 disabled:cursor-wait disabled:opacity-60"
		on:click={rescanLocalLibrary}
		disabled={scanningLocal}
	>
		Rescan
	</button>
	{#if localScanMessage}
		<p class="text-sm text-ink/55">{localScanMessage}</p>
	{/if}
</div>
