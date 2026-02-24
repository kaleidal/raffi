<script lang="ts">
	import { onMount } from "svelte";
	import { currentUser, localMode } from "../../../../lib/stores/authStore";
	import {
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
	export let onSwitchToLocalMode: (keepData: boolean) => void = () => {};

	onMount(() => {
		if (!$localMode && $currentUser && !traktStatusRequested) {
			traktStatusRequested = true;
			void loadTraktStatus();
		}
	});

	$: if ($localMode) {
		traktStatusRequested = false;
		traktStatus = null;
	}

	$: if (!$localMode && $currentUser && !traktStatusRequested) {
		traktStatusRequested = true;
		void loadTraktStatus();
	}

	async function loadTraktStatus() {
		if ($localMode || !$currentUser) {
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

<section class="rounded-[28px] bg-white/[0.04] p-6 flex flex-col gap-5">
	<div>
		<h3 class="text-white text-xl font-semibold">
			Account
		</h3>
		<p class="text-white/60 text-sm">
			Keep your credentials up to date.
		</p>
	</div>
	<div class="rounded-2xl bg-white/[0.08] p-5 space-y-5">
		<div>
			<p class="text-white/60 text-xs uppercase tracking-[0.3em] mb-1">
				Current Email
			</p>
			<p class="text-white break-all">{$currentUser?.email || "No email returned by Ave"}</p>
		</div>

		<div class="rounded-2xl bg-white/[0.06] p-4">
			<p class="text-white/60 text-xs uppercase tracking-[0.3em] mb-1">
				Provider
			</p>
			<p class="text-white">Ave</p>
		</div>

		<div class="rounded-2xl bg-white/[0.06] p-4 space-y-3">
			<div>
				<p class="text-white/60 text-xs uppercase tracking-[0.3em] mb-1">
					Trakt
				</p>
				<p class="text-white font-medium">Watch scrobbling sync</p>
				<p class="text-white/60 text-sm">
					Send start, pause, and stop events to your Trakt profile.
				</p>
			</div>

			{#if traktLoading}
				<p class="text-white/60 text-sm">Loading Trakt status...</p>
			{:else if traktStatus?.connected}
				<div class="rounded-2xl bg-white/[0.04] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
					<div>
						<p class="text-white text-sm">
							Connected as <span class="font-semibold">{traktStatus.username || traktStatus.slug || "Trakt user"}</span>
						</p>
					</div>
					<button
						class="bg-white/10 text-white px-4 py-2 rounded-2xl font-semibold hover:bg-white/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
						on:click={disconnectTrakt}
						disabled={traktBusy}
					>
						{traktBusy ? "Disconnecting..." : "Disconnect"}
					</button>
				</div>
			{:else}
				{#if traktStatus && !traktStatus.configured}
					<p class="text-white/60 text-sm">
						Trakt is not configured yet in this build.
					</p>
				{/if}
				<button
					class="bg-white text-black px-5 py-2 rounded-2xl font-semibold hover:bg-white/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
					on:click={connectTrakt}
					disabled={traktBusy || (traktStatus ? !traktStatus.configured : true)}
				>
					{traktBusy ? "Connecting..." : "Connect Trakt"}
				</button>
			{/if}

			{#if traktMessage}
				<div class="p-3 rounded-2xl bg-green-500/10 border border-green-500/20 text-green-300 text-sm">
					{traktMessage}
				</div>
			{/if}
			{#if traktError}
				<div class="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
					{traktError}
				</div>
			{/if}
		</div>

		{#if message}
			<div class="p-3 rounded-2xl bg-green-500/10 border border-green-500/20 text-green-300 text-sm">
				{message}
			</div>
		{/if}
		{#if error}
			<div class="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
				{error}
			</div>
		{/if}

		<div class="rounded-2xl bg-white/[0.06] p-4 space-y-3">
			<div>
				<p class="text-white font-medium">Log out</p>
				<p class="text-white/60 text-sm">
					Sign out and switch to local mode. Choose whether to keep your synced data locally.
				</p>
			</div>
			<div class="flex flex-col gap-2 sm:flex-row">
				<button
					class="flex-1 bg-white text-black px-4 py-2 rounded-2xl font-semibold hover:bg-white/90 transition-colors cursor-pointer"
					on:click={() => onSwitchToLocalMode(true)}
				>
					Keep synced data
				</button>
				<button
					class="flex-1 bg-white/10 text-white px-4 py-2 rounded-2xl font-semibold hover:bg-white/20 transition-colors cursor-pointer"
					on:click={() => onSwitchToLocalMode(false)}
				>
					Start fresh
				</button>
			</div>
		</div>
	</div>
</section>
