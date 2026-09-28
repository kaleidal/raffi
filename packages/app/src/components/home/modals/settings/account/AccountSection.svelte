<script lang="ts">
	import {
		cloudSyncStatus,
		type TraktStatus,
		getTraktStatus,
		disconnectTrakt as disconnectTraktFromDb,
		getStremioStatus,
		syncStremioLibrary,
		disconnectStremio,
		type StremioConnectionStatus,
	} from "../../../../../lib/db/db";
	import { signInWithTraktViaBrowser } from "../../../../../lib/auth/traktAuth";
	import AccountProfile from "./AccountProfile.svelte";

	let traktLoading = false;
	let traktStatus: TraktStatus | null = null;
	let traktBusy = false;
	let traktMessage = "";
	let traktError = "";
	let traktStatusRequested = false;

	let stremioStatus: StremioConnectionStatus = getStremioStatus();
	let stremioBusy = false;
	let stremioMessage = "";
	let stremioError = "";

	export let error = "";
	export let stremioConnectionRevision = 0;
	export let onSyncNow: () => void | Promise<void> = () => {};
	export let onDownloadData: () => void = () => {};
	export let onImportStremio: () => void = () => {};
	export let onRequestSignOut: () => void = () => {};

	const formatTimestamp = (value: number | null) => {
		if (!value) return "Never";
		return new Date(value).toLocaleString();
	};

	$: pendingSyncCount = $cloudSyncStatus.pendingUploads + $cloudSyncStatus.pendingDeletes;
	$: syncStatusLabel = $cloudSyncStatus.isSyncing
		? "Syncing"
		: $cloudSyncStatus.lastError
			? "Sync failed"
			: "Sync ready";
	$: syncStatusDetail = $cloudSyncStatus.lastError
		? (
			$cloudSyncStatus.lastSuccessAt
				? `Last successful sync: ${formatTimestamp($cloudSyncStatus.lastSuccessAt)}`
				: "No successful sync yet"
		)
		: `Last sync ${formatTimestamp($cloudSyncStatus.lastSuccessAt)}`;
	$: traktActionLabel = traktLoading
		? "Loading..."
		: traktBusy
			? traktStatus?.connected
				? "Disconnecting..."
				: "Connecting..."
			: traktStatus?.connected
				? "Disconnect"
				: "Connect";

	$: if (stremioConnectionRevision >= 0) {
		stremioStatus = getStremioStatus();
	}

	$: stremioActionLabel = stremioBusy ? "Syncing..." : "Sync now";

	$: if (!$cloudSyncStatus.cloudFeaturesAvailable) {
		traktStatusRequested = false;
		traktStatus = null;
	}

	$: if ($cloudSyncStatus.cloudFeaturesAvailable && !traktStatusRequested) {
		traktStatusRequested = true;
		void loadTraktStatus();
	}

	async function loadTraktStatus() {
		traktLoading = true;
		traktError = "";
		try {
			traktStatus = await getTraktStatus();
		} catch (e: any) {
			console.error("Failed to load Trakt status", e);
			traktError = e?.message || "Failed to load Trakt status";
		} finally {
			traktLoading = false;
		}
	}

	async function connectTrakt() {
		traktBusy = true;
		traktError = "";
		traktMessage = "";
		try {
			traktStatus = await signInWithTraktViaBrowser();
			traktMessage = traktStatus?.username
				? `Connected as ${traktStatus.username}`
				: "Trakt connected.";
		} catch (e: any) {
			console.error("Failed to connect Trakt", e);
			traktError = e?.message || "Failed to connect Trakt";
		} finally {
			traktBusy = false;
		}
	}

	async function disconnectTrakt() {
		traktBusy = true;
		traktError = "";
		traktMessage = "";
		try {
			await disconnectTraktFromDb();
			traktStatus = traktStatus
				? { ...traktStatus, connected: false, username: null, slug: null }
				: null;
			traktMessage = "Trakt disconnected.";
		} catch (e: any) {
			console.error("Failed to disconnect Trakt", e);
			traktError = e?.message || "Failed to disconnect Trakt";
		} finally {
			traktBusy = false;
		}
	}

	async function syncStremio() {
		stremioBusy = true;
		stremioError = "";
		stremioMessage = "";
		try {
			const summary = await syncStremioLibrary();
			stremioMessage = `Synced ${summary.total} item${summary.total === 1 ? "" : "s"} (${summary.added} new, ${summary.merged} updated)${summary.addonsAdded > 0 ? ` and ${summary.addonsAdded} addon${summary.addonsAdded === 1 ? "" : "s"}` : ""}.`;
		} catch (e: any) {
			console.error("Failed to sync Stremio", e);
			stremioError = e?.message || "Failed to sync Stremio";
			stremioStatus = getStremioStatus();
		} finally {
			stremioBusy = false;
		}
	}

	async function disconnectStremioAccount() {
		stremioBusy = true;
		stremioError = "";
		stremioMessage = "";
		try {
			await disconnectStremio();
			stremioStatus = getStremioStatus();
			stremioMessage = "Stremio disconnected.";
		} catch (e: any) {
			console.error("Failed to disconnect Stremio", e);
			stremioError = e?.message || "Failed to disconnect Stremio";
		} finally {
			stremioBusy = false;
		}
	}
</script>

<section class="flex flex-col gap-5">
	<div class="rounded-[28px] bg-white/4 p-6 flex flex-col gap-5">
		<AccountProfile />

		<div class="grid gap-3 sm:grid-cols-2">
			<div class="rounded-2xl bg-black/20 px-4 py-4">
				<p class="text-white/50 text-sm">Sync</p>
				<p class="mt-2 text-white text-lg font-semibold">{syncStatusLabel}</p>
				<p class="mt-1 text-white/55 text-sm">{syncStatusDetail}</p>
			</div>
			<div class="rounded-2xl bg-black/20 px-4 py-4">
				<p class="text-white/50 text-sm">Queue</p>
				<p class="mt-2 text-white text-lg font-semibold">{pendingSyncCount}</p>
				<p class="mt-1 text-white/55 text-sm">{$cloudSyncStatus.pendingUploads} uploads, {$cloudSyncStatus.pendingDeletes} deletes</p>
			</div>
		</div>

		<div class="flex flex-wrap gap-3">
			{#if $cloudSyncStatus.cloudFeaturesAvailable}
				<button
					class="bg-white/10 text-white px-4 py-2 rounded-2xl font-semibold hover:bg-white/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
					on:click={onSyncNow}
					disabled={$cloudSyncStatus.isSyncing}
				>
					{$cloudSyncStatus.isSyncing ? "Syncing..." : "Sync now"}
				</button>
			{/if}
			<button
				class="bg-white/10 text-white px-4 py-2 rounded-2xl font-semibold hover:bg-white/20 transition-colors cursor-pointer"
				on:click={onDownloadData}
			>
				Export library and lists
			</button>
			<button
				class="bg-white/10 text-white px-4 py-2 rounded-2xl font-semibold hover:bg-white/20 transition-colors cursor-pointer"
				on:click={onRequestSignOut}
			>
				Sign out
			</button>
			{#if $cloudSyncStatus.lastError}
				<p class="self-center text-sm text-amber-200/90">{$cloudSyncStatus.lastError}</p>
			{/if}
		</div>
	</div>

	<div class="rounded-[28px] bg-white/4 p-6 space-y-4">
		<div class="flex flex-col gap-1">
			<p class="text-white font-medium">Integrations</p>
			<p class="text-white/60 text-sm">Connected services that extend sync and playback across platforms.</p>
		</div>

		<div class="rounded-2xl bg-black/20 px-4 py-4 space-y-3">
			<div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<p class="text-white font-medium">Trakt</p>
					<p class="text-white/60 text-sm">Send watch progress and playback state to your Trakt profile.</p>
				</div>
				{#if $cloudSyncStatus.cloudFeaturesAvailable && !traktLoading && (!traktStatus || traktStatus.configured)}
					<button
						class={`${traktStatus?.connected ? "bg-white/10 text-white hover:bg-white/20" : "bg-white text-black hover:bg-white/90"} px-4 py-2 rounded-2xl font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0`}
						on:click={traktStatus?.connected ? disconnectTrakt : connectTrakt}
						disabled={traktBusy}
					>
						{traktActionLabel}
					</button>
				{/if}
			</div>

			{#if !$cloudSyncStatus.cloudFeaturesAvailable}
				<p class="text-white/60 text-sm">
					Cloud backup is offline, so Trakt and watch party features are temporarily hidden.
				</p>
			{:else if traktLoading}
				<p class="text-white/60 text-sm">Loading Trakt status...</p>
			{:else}
				{#if traktStatus && !traktStatus.configured}
					<p class="text-white/60 text-sm">Trakt is not configured yet in this build.</p>
				{/if}
			{/if}

			{#if traktMessage}
				<div class="p-3 rounded-2xl bg-emerald-500/12 text-emerald-200 text-sm">{traktMessage}</div>
			{/if}
			{#if traktError}
				<div class="p-3 rounded-2xl bg-red-500/12 text-red-200 text-sm">{traktError}</div>
			{/if}
		</div>

		<div class="rounded-2xl bg-black/20 px-4 py-4 space-y-3">
			<div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<p class="text-white font-medium">Stremio</p>
					<p class="text-white/60 text-sm">
						{#if stremioStatus.connected}
							Connected as {stremioStatus.email}
							{#if stremioStatus.connectedAt}
								· since {formatTimestamp(Date.parse(stremioStatus.connectedAt))}
							{/if}
						{:else}
							Import your library and addons once, or stay connected to sync watch progress again later.
						{/if}
					</p>
				</div>
				<div class="flex flex-wrap gap-2 shrink-0">
					{#if stremioStatus.connected}
						<button
							class="bg-white text-black px-4 py-2 rounded-2xl font-semibold hover:bg-white/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
							on:click={syncStremio}
							disabled={stremioBusy}
						>
							{stremioActionLabel}
						</button>
						<button
							class="bg-white/10 text-white px-4 py-2 rounded-2xl font-semibold hover:bg-white/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
							on:click={disconnectStremioAccount}
							disabled={stremioBusy}
						>
							Disconnect
						</button>
					{:else}
						<button
							class="bg-white/10 text-white px-4 py-2 rounded-2xl font-semibold hover:bg-white/20 transition-colors cursor-pointer"
							on:click={onImportStremio}
						>
							Sign in to import
						</button>
					{/if}
				</div>
			</div>

			{#if stremioMessage}
				<div class="p-3 rounded-2xl bg-emerald-500/12 text-emerald-200 text-sm">{stremioMessage}</div>
			{/if}
			{#if stremioError}
				<div class="p-3 rounded-2xl bg-red-500/12 text-red-200 text-sm">{stremioError}</div>
			{/if}
		</div>
	</div>

	{#if error}
		<div class="p-3 rounded-2xl bg-red-500/12 text-red-200 text-sm">{error}</div>
	{/if}
</section>
