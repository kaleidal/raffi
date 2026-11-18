<script lang="ts">
	import {
		cloudSyncStatus,
		type TraktDeviceCode,
		type TraktStatus,
		getTraktStatus,
		startTraktDeviceSignIn,
		disconnectTrakt as disconnectTraktFromDb,
	} from "../../../lib/db/db";
	import {
		getStremioStatus,
		syncStremioLibrary,
		disconnectStremio,
	} from "../../../lib/import/stremioAccount";
	import type { StremioConnectionStatus } from "../../../lib/import/stremioConnection";
	import { waitForTraktApproval } from "../../../lib/auth/traktAuth";
	import { openExternal } from "../../../lib/shell/openExternal";
	import { onDestroy } from "svelte";
	import AccountProfile from "./AccountProfile.svelte";
	import SettingRow from "../SettingRow.svelte";
	import { primaryButton, secondaryButton } from "../buttons";

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

	const formatTimestamp = (value: number | null) =>
		value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "never";

	$: pendingSyncCount = $cloudSyncStatus.pendingUploads + $cloudSyncStatus.pendingDeletes;
	$: syncDescription = [
		$cloudSyncStatus.isSyncing ? "Syncing now" : `Last synced ${formatTimestamp($cloudSyncStatus.lastSuccessAt)}`,
		pendingSyncCount > 0 ? `${pendingSyncCount} waiting` : "",
	]
		.filter(Boolean)
		.join(" · ");
	$: traktDescription = !$cloudSyncStatus.cloudFeaturesAvailable
		? "Unavailable while sync is offline."
		: traktStatus && !traktStatus.configured
			? "Not available in this build."
			: traktStatus?.connected
				? "Sends your progress to your Trakt profile."
				: "Send your progress to your Trakt profile.";
	$: stremioDescription = stremioStatus.connected
		? `Connected as ${stremioStatus.email}`
		: "Import your library and addons, or stay connected to keep progress in sync.";
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
			await openExternal(url);
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

<AccountProfile />

<div class="pt-4">
	<SettingRow title="Sync" description={syncDescription}>
		{#if $cloudSyncStatus.cloudFeaturesAvailable}
			<button class={secondaryButton} on:click={onSyncNow} disabled={$cloudSyncStatus.isSyncing}>
				Sync now
			</button>
		{/if}
	</SettingRow>
	{#if $cloudSyncStatus.lastError}
		<p class="pb-2 text-sm text-warning">{$cloudSyncStatus.lastError}</p>
	{/if}

	<SettingRow title="Export" description="Download your library and lists as a file.">
		<button class={secondaryButton} on:click={onDownloadData}>Export</button>
	</SettingRow>

	<SettingRow title="Sign out" description="You can keep your data on this device.">
		<button class={secondaryButton} on:click={onRequestSignOut}>Sign out</button>
	</SettingRow>
</div>

<h3 class="pt-8 pb-1 text-lg font-semibold text-ink">Connected services</h3>

<SettingRow title="Trakt" description={traktDescription}>
	{#if $cloudSyncStatus.cloudFeaturesAvailable && !traktLoading && (!traktStatus || traktStatus.configured)}
		<button
			class={traktStatus?.connected ? secondaryButton : primaryButton}
			on:click={traktStatus?.connected ? disconnectTrakt : connectTrakt}
			disabled={traktBusy}
		>
			{traktActionLabel}
		</button>
	{/if}
</SettingRow>

{#if traktCode}
	<div class="mb-3 flex flex-col gap-3 rounded-3xl bg-ink/6 p-5">
		<p class="text-sm text-ink/60">Go to {traktCode.verificationUrl.replace("https://", "")} and enter this code.</p>
		<p class="select-all text-3xl font-semibold tracking-widest text-ink">{traktCode.userCode}</p>
		<div class="flex flex-wrap gap-2">
			<button class={primaryButton} on:click={() => traktCode && openTrakt(traktCode.verificationUrl)}>Open Trakt</button>
			<button class={secondaryButton} on:click={cancelTraktSignIn}>Cancel</button>
		</div>
	</div>
{/if}
{#if traktMessage}
	<p class="pb-2 text-sm text-success">{traktMessage}</p>
{/if}
{#if traktError}
	<p class="pb-2 text-sm text-danger">{traktError}</p>
{/if}

<SettingRow title="Stremio" description={stremioDescription}>
	<div class="flex flex-wrap gap-2">
		{#if stremioStatus.connected}
			<button class={primaryButton} on:click={syncStremio} disabled={stremioBusy}>{stremioActionLabel}</button>
			<button class={secondaryButton} on:click={disconnectStremioAccount} disabled={stremioBusy}>Disconnect</button>
		{:else}
			<button class={secondaryButton} on:click={onImportStremio}>Import</button>
		{/if}
	</div>
</SettingRow>
{#if stremioMessage}
	<p class="pb-2 text-sm text-success">{stremioMessage}</p>
{/if}
{#if stremioError}
	<p class="pb-2 text-sm text-danger">{stremioError}</p>
{/if}

{#if error}
	<p class="pt-4 text-sm text-danger">{error}</p>
{/if}
