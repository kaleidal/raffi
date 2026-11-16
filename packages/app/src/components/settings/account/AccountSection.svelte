<script lang="ts">
	import {
		cloudSyncStatus,
		type TraktDeviceCode,
		type TraktStatus,
		getTraktStatus,
		startTraktDeviceSignIn,
		disconnectTrakt as disconnectTraktFromDb,
		getStremioStatus,
		syncStremioLibrary,
		disconnectStremio,
		type StremioConnectionStatus,
	} from "../../../lib/db/db";
	import { openTraktActivation, waitForTraktApproval } from "../../../lib/auth/traktAuth";
	import { onDestroy } from "svelte";
	import AccountProfile from "./AccountProfile.svelte";
	import SettingRow from "../SettingRow.svelte";

	let traktLoading = false;
	let traktStatus: TraktStatus | null = null;
	let traktBusy = false;
	let traktMessage = "";
	let traktError = "";
	let traktStatusRequested = false;
	let traktCode: TraktDeviceCode | null = null;
	let traktSignIn: AbortController | null = null;

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
				: traktCode
					? "Waiting for Trakt..."
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
		const signIn = new AbortController();
		traktSignIn = signIn;
		try {
			traktCode = await startTraktDeviceSignIn();
			traktStatus = await waitForTraktApproval(traktCode, signIn.signal);
			traktMessage = traktStatus?.username
				? `Connected as ${traktStatus.username}`
				: "Trakt connected.";
		} catch (e: any) {
			if (!signIn.signal.aborted) {
				console.error("Failed to connect Trakt", e);
				traktError = e?.message || "Failed to connect Trakt";
			}
		} finally {
			traktCode = null;
			traktSignIn = null;
			traktBusy = false;
		}
	}

	const cancelTraktSignIn = () => traktSignIn?.abort();

	async function openTrakt(url: string) {
		traktError = "";
		try {
			await openTraktActivation(url);
		} catch (e) {
			console.error("Failed to open Trakt", e);
			traktError = "Couldn't open your browser. Open the address above yourself and enter the code.";
		}
	}

	onDestroy(cancelTraktSignIn);

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

<section class="flex flex-col gap-6">
	<div class="flex flex-col gap-5">
		<AccountProfile />

		<SettingRow
			title={syncStatusLabel}
			description={pendingSyncCount > 0 ? `${syncStatusDetail} · ${pendingSyncCount} waiting to sync` : syncStatusDetail}
		/>

		<div class="flex flex-wrap gap-3">
			{#if $cloudSyncStatus.cloudFeaturesAvailable}
				<button
					class="bg-ink/10 text-ink px-4 py-2 rounded-full font-semibold hover:bg-ink/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
					on:click={onSyncNow}
					disabled={$cloudSyncStatus.isSyncing}
				>
					{$cloudSyncStatus.isSyncing ? "Syncing..." : "Sync now"}
				</button>
			{/if}
			<button
				class="bg-ink/10 text-ink px-4 py-2 rounded-full font-semibold hover:bg-ink/20 transition-colors cursor-pointer"
				on:click={onDownloadData}
			>
				Export library and lists
			</button>
			<button
				class="bg-ink/10 text-ink px-4 py-2 rounded-full font-semibold hover:bg-ink/20 transition-colors cursor-pointer"
				on:click={onRequestSignOut}
			>
				Sign out
			</button>
			{#if $cloudSyncStatus.lastError}
				<p class="self-center text-sm text-warning/90">{$cloudSyncStatus.lastError}</p>
			{/if}
		</div>
	</div>

	<div class="flex flex-col">
		<h3 class="pb-1 text-lg font-semibold text-ink">Connected services</h3>

		<div class="py-3.5 space-y-3">
			<div class="flex flex-col gap-3 sm:gap-6 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<p class="text-ink font-medium">Trakt</p>
					<p class="text-ink/60 text-sm">Send watch progress and playback state to your Trakt profile.</p>
				</div>
				{#if $cloudSyncStatus.cloudFeaturesAvailable && !traktLoading && (!traktStatus || traktStatus.configured)}
					<button
						class={`${traktStatus?.connected ? "bg-ink/10 text-ink hover:bg-ink/20" : "bg-accent text-on-accent hover:bg-accent/85"} px-4 py-2 rounded-full font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0`}
						on:click={traktStatus?.connected ? disconnectTrakt : connectTrakt}
						disabled={traktBusy}
					>
						{traktActionLabel}
					</button>
				{/if}
			</div>

			{#if !$cloudSyncStatus.cloudFeaturesAvailable}
				<p class="text-ink/60 text-sm">
					Cloud backup is offline, so Trakt and watch party features are temporarily hidden.
				</p>
			{:else if traktLoading}
				<p class="text-ink/60 text-sm">Loading Trakt status...</p>
			{:else}
				{#if traktStatus && !traktStatus.configured}
					<p class="text-ink/60 text-sm">Trakt is not configured yet in this build.</p>
				{/if}
			{/if}

			{#if traktCode}
				<div class="rounded-3xl bg-ink/6 p-5 flex flex-col gap-3">
					<p class="text-ink/60 text-sm">Go to {traktCode.verificationUrl.replace("https://", "")} and enter this code.</p>
					<p class="text-ink text-3xl font-semibold tracking-widest select-all">{traktCode.userCode}</p>
					<div class="flex flex-wrap gap-2">
						<button
							class="bg-accent text-on-accent px-4 py-2 rounded-full font-semibold hover:bg-accent/85 transition-colors cursor-pointer"
							on:click={() => traktCode && openTrakt(traktCode.verificationUrl)}
						>
							Open Trakt
						</button>
						<button
							class="bg-ink/10 text-ink px-4 py-2 rounded-full font-semibold hover:bg-ink/20 transition-colors cursor-pointer"
							on:click={cancelTraktSignIn}
						>
							Cancel
						</button>
					</div>
				</div>
			{/if}

			{#if traktMessage}
				<div class="p-3 rounded-2xl bg-success/12 text-success text-sm">{traktMessage}</div>
			{/if}
			{#if traktError}
				<div class="p-3 rounded-2xl bg-danger/12 text-danger text-sm">{traktError}</div>
			{/if}
		</div>

		<div class="py-3.5 space-y-3">
			<div class="flex flex-col gap-3 sm:gap-6 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<p class="text-ink font-medium">Stremio</p>
					<p class="text-ink/60 text-sm">
						{#if stremioStatus.connected}
							Connected as {stremioStatus.email}
							{#if stremioStatus.connectedAt}
								· since {formatTimestamp(Date.parse(stremioStatus.connectedAt))}
							{/if}
						{:else}
							Import your library and addons, or stay connected to keep progress in sync.
						{/if}
					</p>
				</div>
				<div class="flex flex-wrap gap-2 shrink-0">
					{#if stremioStatus.connected}
						<button
							class="bg-accent text-on-accent px-4 py-2 rounded-full font-semibold hover:bg-accent/85 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
							on:click={syncStremio}
							disabled={stremioBusy}
						>
							{stremioActionLabel}
						</button>
						<button
							class="bg-ink/10 text-ink px-4 py-2 rounded-full font-semibold hover:bg-ink/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
							on:click={disconnectStremioAccount}
							disabled={stremioBusy}
						>
							Disconnect
						</button>
					{:else}
						<button
							class="bg-ink/10 text-ink px-4 py-2 rounded-full font-semibold hover:bg-ink/20 transition-colors cursor-pointer"
							on:click={onImportStremio}
						>
							Sign in to import
						</button>
					{/if}
				</div>
			</div>

			{#if stremioMessage}
				<div class="p-3 rounded-2xl bg-success/12 text-success text-sm">{stremioMessage}</div>
			{/if}
			{#if stremioError}
				<div class="p-3 rounded-2xl bg-danger/12 text-danger text-sm">{stremioError}</div>
			{/if}
		</div>
	</div>

	{#if error}
		<div class="p-3 rounded-2xl bg-danger/12 text-danger text-sm">{error}</div>
	{/if}
</section>
