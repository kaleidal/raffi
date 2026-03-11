<script lang="ts">
	import { cloudSyncStatus } from "../../../../lib/db/db";

	export let onDownloadData: () => void = () => {};
	export let onSyncNow: () => void | Promise<void> = () => {};

	const formatTimestamp = (value: number | null) => {
		if (!value) return "Never";
		return new Date(value).toLocaleString();
	};

	$: reachabilityLabel =
		$cloudSyncStatus.reachability === "online"
			? "Connected"
			: $cloudSyncStatus.reachability === "offline"
				? "Offline"
				: "Checking";
</script>

<section class="rounded-[28px] bg-white/[0.04] p-6 flex flex-col gap-5">
	<div>
		<h3 class="text-white text-xl font-semibold">
			Data & Backups
		</h3>
		<p class="text-white/60 text-sm">
			Your device stays primary. Export a JSON copy any time, and Ave backup stays optional.
		</p>
	</div>
	<div class="rounded-2xl bg-white/[0.08] p-5 flex flex-col gap-4">
		<div class="flex items-start justify-between gap-4">
			<div>
				<p class="text-white font-medium">Cloud backup status</p>
				<p class="text-white/60 text-sm">
					Local backup ready: {$cloudSyncStatus.localBackupReady ? "Yes" : "Preparing local copy..."}
				</p>
			</div>
			<div class="rounded-full px-3 py-1 text-xs font-semibold border { $cloudSyncStatus.reachability === 'online' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : $cloudSyncStatus.reachability === 'offline' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-white/5 border-white/10 text-white/70' }">
				{reachabilityLabel}
			</div>
		</div>
		<div class="grid gap-3 sm:grid-cols-2">
			<div class="rounded-xl bg-white/[0.05] p-4">
				<p class="text-white/60 text-xs uppercase tracking-[0.2em] mb-1">Pending changes</p>
				<p class="text-white text-lg font-semibold">{$cloudSyncStatus.pendingUploads}</p>
			</div>
			<div class="rounded-xl bg-white/[0.05] p-4">
				<p class="text-white/60 text-xs uppercase tracking-[0.2em] mb-1">Pending deletes</p>
				<p class="text-white text-lg font-semibold">{$cloudSyncStatus.pendingDeletes}</p>
			</div>
		</div>
		<div class="grid gap-2 text-sm text-white/70">
			<p>Last backup: {formatTimestamp($cloudSyncStatus.lastSuccessAt)}</p>
			<p>Last attempt: {formatTimestamp($cloudSyncStatus.lastAttemptAt)}</p>
			{#if $cloudSyncStatus.lastError}
				<p class="text-amber-300">{$cloudSyncStatus.lastError}</p>
			{/if}
		</div>
		<div class="flex flex-wrap gap-3">
			<button
				class="bg-white text-black px-5 py-2 rounded-2xl font-semibold hover:bg-white/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
				on:click={onSyncNow}
				disabled={$cloudSyncStatus.isSyncing}
			>
				{$cloudSyncStatus.isSyncing ? "Syncing..." : "Sync now"}
			</button>
		</div>
	</div>
	<div class="rounded-2xl bg-white/[0.08] p-5 flex flex-col gap-4">
		<div>
			<p class="text-white font-medium">
				Export library + lists
			</p>
			<p class="text-white/60 text-sm">
				Includes history, lists, and metadata.
			</p>
		</div>
		<button
			class="self-start bg-white text-black px-6 py-3 rounded-2xl font-semibold hover:bg-white/90 transition-colors cursor-pointer"
			on:click={onDownloadData}
		>
			Download JSON
		</button>
	</div>
</section>
