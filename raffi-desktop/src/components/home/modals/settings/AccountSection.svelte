<script lang="ts">
	import { onMount } from "svelte";
	import { currentUser, localMode } from "../../../../lib/stores/authStore";
	import {
		cloudSyncStatus,
		type TraktStatus,
		getTraktStatus,
		disconnectTrakt as disconnectTraktFromDb,
	} from "../../../../lib/db/db";
	import { signInWithTraktViaBrowser } from "../../../../lib/auth/traktAuth";
	import { trackEvent } from "../../../../lib/analytics";

	let traktLoading = false;
	let traktStatus: TraktStatus | null = null;
	let traktBusy = false;
	let traktMessage = "";
	let traktError = "";
	let traktStatusRequested = false;

	export let message = "";
	export let error = "";
	export let onSyncNow: () => void | Promise<void> = () => {};
	export let onDownloadData: () => void = () => {};
	export let onRequestSignOut: () => void = () => {};

	const formatTimestamp = (value: number | null) => {
		if (!value) return "Never";
		return new Date(value).toLocaleString();
	};

	$: accountName = $currentUser?.name || $currentUser?.email?.split("@")[0] || "Local viewer";
	$: accountEmail = $currentUser?.email || "No email returned by Ave";
	$: avatarInitial = (accountName || "?").slice(0, 1).toUpperCase();
	$: pendingSyncCount = $cloudSyncStatus.pendingUploads + $cloudSyncStatus.pendingDeletes;
	$: showSyncNow = !$localMode && $cloudSyncStatus.cloudFeaturesAvailable && ($cloudSyncStatus.isSyncing || pendingSyncCount > 0 || Boolean($cloudSyncStatus.lastError));
	$: traktActionLabel = traktLoading
		? "Loading..."
		: traktBusy
			? traktStatus?.connected
				? "Disconnecting..."
				: "Connecting..."
			: traktStatus?.connected
				? "Disconnect"
				: "Connect";

	onMount(() => {
		if (!$localMode && $currentUser && $cloudSyncStatus.cloudFeaturesAvailable && !traktStatusRequested) {
			traktStatusRequested = true;
			void loadTraktStatus();
		}
	});

	$: if ($localMode || !$cloudSyncStatus.cloudFeaturesAvailable) {
		traktStatusRequested = false;
		traktStatus = null;
	}

	$: if (!$localMode && $currentUser && $cloudSyncStatus.cloudFeaturesAvailable && !traktStatusRequested) {
		traktStatusRequested = true;
		void loadTraktStatus();
	}

	async function loadTraktStatus() {
		if ($localMode || !$currentUser || !$cloudSyncStatus.cloudFeaturesAvailable) {
			traktStatus = null;
			return;
		}
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
			trackEvent("trakt_connect_success", { source: "settings" });
		} catch (e: any) {
			console.error("Failed to connect Trakt", e);
			traktError = e?.message || "Failed to connect Trakt";
			trackEvent("trakt_connect_failed", {
				error_name: e instanceof Error ? e.name : "unknown",
			});
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
			trackEvent("trakt_disconnect_success", { source: "settings" });
		} catch (e: any) {
			console.error("Failed to disconnect Trakt", e);
			traktError = e?.message || "Failed to disconnect Trakt";
			trackEvent("trakt_disconnect_failed", {
				error_name: e instanceof Error ? e.name : "unknown",
			});
		} finally {
			traktBusy = false;
		}
	}
</script>

<section class="flex flex-col gap-5">
	<div class="rounded-[24px] bg-white/[0.06] p-5 md:p-6 flex flex-col gap-5">
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div class="flex items-center gap-4 min-w-0">
				<div class="h-18 w-18 rounded-[26px] bg-white/[0.09] overflow-hidden shrink-0 flex items-center justify-center text-white text-2xl font-semibold">
					{#if $currentUser?.avatar}
						<img
							src={$currentUser.avatar}
							alt={accountName}
							class="h-full w-full object-cover"
						/>
					{:else}
						{avatarInitial}
					{/if}
				</div>
				<div class="min-w-0">
					<p class="text-white text-2xl font-semibold truncate">{accountName}</p>
					<p class="text-white/62 text-sm break-all">{accountEmail}</p>
					<div class="mt-3 flex flex-wrap gap-2">
						<div class="rounded-full bg-black/25 px-3 py-1 text-xs font-medium text-white/78">
							{$localMode ? "Local" : "Ave"}
						</div>
						{#if !$localMode && $cloudSyncStatus.cloudFeaturesAvailable}
							<div class="rounded-full bg-white/[0.08] px-3 py-1 text-xs text-white/72">
								{$cloudSyncStatus.isSyncing ? "Syncing now" : `${pendingSyncCount} queued change${pendingSyncCount === 1 ? "" : "s"}`}
							</div>
						{/if}
					</div>
				</div>
			</div>
			{#if showSyncNow}
				<button
					class="bg-white text-black px-5 py-2.5 rounded-2xl font-semibold hover:bg-white/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
					on:click={onSyncNow}
					disabled={$cloudSyncStatus.isSyncing}
				>
					{$cloudSyncStatus.isSyncing ? "Syncing..." : "Sync now"}
				</button>
			{/if}
		</div>

		<div class="grid gap-3 sm:grid-cols-2">
			<div class="rounded-2xl bg-black/20 px-4 py-4">
				<p class="text-white/50 text-sm">Sync</p>
				<p class="mt-2 text-white text-lg font-semibold">{$localMode ? "Device only" : "Sync ready"}</p>
				<p class="mt-1 text-white/55 text-sm">Last sync {formatTimestamp($cloudSyncStatus.lastSuccessAt)}</p>
			</div>
			<div class="rounded-2xl bg-black/20 px-4 py-4">
				<p class="text-white/50 text-sm">Queue</p>
				<p class="mt-2 text-white text-lg font-semibold">{pendingSyncCount}</p>
				<p class="mt-1 text-white/55 text-sm">{$cloudSyncStatus.pendingUploads} uploads, {$cloudSyncStatus.pendingDeletes} deletes</p>
			</div>
		</div>

		<div class="flex flex-wrap gap-3">
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

	<div class="rounded-2xl bg-white/[0.05] p-5 space-y-4">
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
				{#if traktStatus && !traktStatus.configured}
					<p class="text-white/50 text-sm">This slot is ready for future integrations too.</p>
				{/if}
			{/if}

			{#if traktMessage}
				<div class="p-3 rounded-2xl bg-emerald-500/12 text-emerald-200 text-sm">{traktMessage}</div>
			{/if}
			{#if traktError}
				<div class="p-3 rounded-2xl bg-red-500/12 text-red-200 text-sm">{traktError}</div>
			{/if}
		</div>
	</div>

	{#if message}
		<div class="p-3 rounded-2xl bg-emerald-500/12 text-emerald-200 text-sm">{message}</div>
	{/if}
	{#if error}
		<div class="p-3 rounded-2xl bg-red-500/12 text-red-200 text-sm">{error}</div>
	{/if}
</section>
