<script lang="ts">
	import LoadingSpinner from "../../common/LoadingSpinner.svelte";
	import AccountSection from "./AccountSection.svelte";
	import AccountStateMismatchSection from "./AccountStateMismatchSection.svelte";
	import LocalModeSignInSection from "./LocalModeSignInSection.svelte";
	import SignOutDialog from "./SignOutDialog.svelte";
	import StremioImportModal from "./stremioImport/StremioImportModal.svelte";
	import {
		clearLocalState,
		getLibrary,
		getListsWithItems,
		syncCloudBackupNow,
		syncUserStateToLocal,
	} from "../../../lib/db/db";
	import { authInitializing, currentUser, localMode, signOutToLocalMode } from "../../../lib/stores/authStore";
	import { router } from "../../../lib/stores/router";
	import { closeSettings } from "../../../lib/stores/settings";

	let error = "";
	let showSignOut = false;
	let showStremioImport = false;
	let stremioConnectionRevision = 0;

	async function downloadData() {
		try {
			const data = {
				library: await getLibrary(10000),
				lists: await getListsWithItems(),
				exportedAt: new Date().toISOString(),
			};
			const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
			const link = document.createElement("a");
			link.href = url;
			link.download = `raffi-data-${new Date().toISOString().split("T")[0]}.json`;
			link.click();
			URL.revokeObjectURL(url);
		} catch (e) {
			console.error("Failed to download data", e);
			error = "Failed to download data";
		}
	}

	async function switchToLocalMode(keepData: boolean) {
		if (!$currentUser) return;
		error = "";
		showSignOut = false;
		try {
			if (keepData) await syncUserStateToLocal($currentUser.id);
			else clearLocalState();
			signOutToLocalMode();
			router.navigate("home");
		} catch (e) {
			console.error("Failed to switch to local mode", e);
			error = "Failed to switch to local mode";
		}
	}

	function handleSignedIn() {
		closeSettings();
		router.navigate("home");
	}

	async function syncNow() {
		error = "";
		try {
			const result = await syncCloudBackupNow();
			if (!result?.ok) error = "Cloud backup is currently unavailable.";
		} catch (e: any) {
			console.error("Failed to sync cloud backup", e);
			error = e?.message || "Failed to sync cloud backup";
		}
	}
</script>

{#if $localMode}
	<LocalModeSignInSection onSignedIn={handleSignedIn} />
{:else if $authInitializing}
	<div class="flex items-center gap-3 py-6 text-ink/60">
		<LoadingSpinner size="22px" />
		Restoring your account…
	</div>
{:else if $currentUser}
	<AccountSection
		{error}
		{stremioConnectionRevision}
		onSyncNow={syncNow}
		onDownloadData={downloadData}
		onImportStremio={() => (showStremioImport = true)}
		onRequestSignOut={() => (showSignOut = true)}
	/>
{:else}
	<AccountStateMismatchSection
		onRecoverToLocalMode={() => {
			signOutToLocalMode();
			error = "";
		}}
	/>
{/if}


{#if showSignOut}
	<SignOutDialog onChoose={switchToLocalMode} onCancel={() => (showSignOut = false)} />
{/if}

<StremioImportModal
	open={showStremioImport}
	on:close={() => (showStremioImport = false)}
	on:imported={() => (stremioConnectionRevision += 1)}
/>
