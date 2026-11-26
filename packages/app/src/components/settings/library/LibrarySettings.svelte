<script lang="ts">
	import { primaryButton, secondaryButton } from "../buttons";
	import { onMount } from "svelte";
	import {
		getRoots as getLocalRoots,
		removeRoot,
		scanAndIndex,
	} from "../../../lib/library/localLibrary";

	let localRoots = $state<string[]>([]);
	let scanningLocal = $state(false);
	let localScanMessage = $state("");

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
			onclick={() => removeLocalFolder(folder)}
		>
			Remove
		</button>
	</div>
{:else}
	<p class="py-2.5 text-sm text-ink/45">No folders yet.</p>
{/each}

<div class="flex flex-wrap items-center gap-3 pt-4">
	<button
		class={primaryButton}
		onclick={addLocalFolder}
	>
		Add folder
	</button>
	<button
		class={secondaryButton}
		onclick={rescanLocalLibrary}
		disabled={scanningLocal}
	>
		Rescan
	</button>
	{#if localScanMessage}
		<p class="text-sm text-ink/55">{localScanMessage}</p>
	{/if}
</div>
