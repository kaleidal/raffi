<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { X } from "@lucide/svelte";
    import { fade, scale } from "svelte/transition";
	import {
		getLibrary,
		getListsWithItems,
	} from "../../../lib/db/db";
	import {
		clearLocalState,
		syncCloudBackupNow,
		syncUserStateToLocal,
	} from "../../../lib/db/db";
	import {
		currentUser,
		signInWithAve,
		signOutToLocalMode,
		localMode,
		updateStatus,
	} from "../../../lib/stores/authStore";
	import { router } from "../../../lib/stores/router";
	import {
		trackEvent,
	} from "../../../lib/analytics";
	import { withOverlayZoomStyle } from "../../../lib/overlayZoom";
	import ActivitySection from "./settings/ActivitySection.svelte";
	import FeedbackSection from "./settings/FeedbackSection.svelte";
	import UpdateSection from "./settings/UpdateSection.svelte";
	import LocalModeSignInSection from "./settings/LocalModeSignInSection.svelte";
	import PreferencesSection from "./settings/PreferencesSection.svelte";
	import PrivacySection from "./settings/PrivacySection.svelte";
	import LocalLibrarySection from "./settings/LocalLibrarySection.svelte";
	import AccountSection from "./settings/AccountSection.svelte";
	import AccountStateMismatchSection from "./settings/AccountStateMismatchSection.svelte";

	const portal = (node: HTMLElement) => {
		if (typeof document === "undefined") {
			return { destroy() {} };
		}
		document.body.appendChild(node);
		return {
			destroy() {
				if (node.parentNode) {
					node.parentNode.removeChild(node);
				}
			},
		};
	};


	export let showSettings = false;

	let stats = {
		moviesWatched: 0,
		showsWatched: 0,
	};

	let message = "";
	let error = "";
	let showUpdateNotes = false;
	let showSignOutModal = false;
	let aveLoading = false;
	let bodyLocked = false;

	const refreshStats = async () => {
		try {
			const library = await getLibrary(1000);
			stats.moviesWatched = library.filter((i) => i.type === "movie" || !i.type).length;
			stats.showsWatched = library.filter((i) => i.type === "series").length;
		} catch (e) {
			console.error("Failed to load stats", e);
		}
	};


	onMount(async () => {
		await refreshStats();
	});

	const toggleBodyScroll = (active: boolean) => {
		if (typeof document === "undefined") return;
		const body = document.body;
		const html = document.documentElement;
		const container = document.querySelector(
			"[data-scroll-container]",
		) as HTMLElement | null;
		const count = Number(body.dataset.modalCount || "0");
		if (active) {
			if (count === 0) {
				const scrollY = window.scrollY;
				body.dataset.scrollY = String(scrollY);
				body.dataset.prevOverflow = body.style.overflow || "";
				body.dataset.prevPosition = body.style.position || "";
				body.dataset.prevTop = body.style.top || "";
				body.dataset.prevWidth = body.style.width || "";
				body.style.overflow = "hidden";
				body.style.position = "fixed";
				body.style.top = `-${scrollY}px`;
				body.style.width = "100%";
				html.style.overflow = "hidden";
				if (container) {
					container.dataset.prevOverflowY = container.style.overflowY || "";
					container.dataset.prevOverflowX = container.style.overflowX || "";
					container.style.overflowY = "hidden";
					container.style.overflowX = "hidden";
				}
			}
			body.dataset.modalCount = String(count + 1);
			return;
		}
		const next = Math.max(0, count - 1);
		body.dataset.modalCount = String(next);
		if (next === 0) {
			const scrollY = Number(body.dataset.scrollY || "0");
			body.style.overflow = body.dataset.prevOverflow || "";
			body.style.position = body.dataset.prevPosition || "";
			body.style.top = body.dataset.prevTop || "";
			body.style.width = body.dataset.prevWidth || "";
			html.style.overflow = "";
			delete body.dataset.prevOverflow;
			delete body.dataset.prevPosition;
			delete body.dataset.prevTop;
			delete body.dataset.prevWidth;
			delete body.dataset.scrollY;
			if (container) {
				container.style.overflowY = container.dataset.prevOverflowY || "";
				container.style.overflowX = container.dataset.prevOverflowX || "";
				delete container.dataset.prevOverflowY;
				delete container.dataset.prevOverflowX;
			}
			window.scrollTo(0, scrollY);
		}
	};

	const updateBodyLock = (active: boolean) => {
		if (active && !bodyLocked) {
			toggleBodyScroll(true);
			bodyLocked = true;
		} else if (!active && bodyLocked) {
			toggleBodyScroll(false);
			bodyLocked = false;
		}
	};


	function close() {
		showSignOutModal = false;
		showSettings = false;
	}

	function openSignOutModal() {
		showSignOutModal = true;
	}

	function closeSignOutModal() {
		showSignOutModal = false;
	}

	function openExternalLink(url: string) {
		const target = String(url || "").trim();
		if (!target) return;
		const electronApi = (window as any).electronAPI as
			| { openExternal?: (url: string) => Promise<void> }
			| undefined;

		if (electronApi?.openExternal) {
			electronApi.openExternal(target).catch((error) => {
				console.error("Failed to open external link", error);
				window.location.assign(target);
			});
			return;
		}

		window.location.assign(target);
	}


	async function downloadData() {
		try {
			const library = await getLibrary(10000);
			const lists = await getListsWithItems();

			const data = {
				library,
				lists,
				exportedAt: new Date().toISOString(),
			};

			const blob = new Blob([JSON.stringify(data, null, 2)], {
				type: "application/json",
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `raffi-data-${new Date().toISOString().split("T")[0]}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			trackEvent("data_exported", { success: true });
		} catch (e) {
			console.error("Failed to download data", e);
			error = "Failed to download data";
			trackEvent("data_export_failed", {
				error_name: e instanceof Error ? e.name : "unknown",
			});
		}
	}


	async function switchToLocalMode(keepData: boolean) {
		if (!$currentUser) return;
		message = "";
		error = "";
		showSignOutModal = false;
		try {
			if (keepData) {
				await syncUserStateToLocal($currentUser.id);
			} else {
				clearLocalState();
			}
			signOutToLocalMode();
			await refreshStats();
			trackEvent("local_mode_switched", { keep_data: keepData });
			message = keepData
				? "Switched to local mode. Your device data stays available offline."
				: "Switched to local mode with a fresh local library.";
			router.navigate("home");
		} catch (e: any) {
			console.error("Failed to switch to local mode", e);
			error = "Failed to switch to local mode";
			trackEvent("local_mode_switch_failed", {
				error_name: e instanceof Error ? e.name : "unknown",
			});
		}
	}

	function recoverToLocalMode() {
		signOutToLocalMode();
		message = "Recovered auth state. You are now in local mode.";
		error = "";
	}


	async function handleAveLogin() {
		error = "";
		message = "";
		aveLoading = true;
		try {
			await signInWithAve();
			await refreshStats();
			trackEvent("ave_login_success", { source: "settings" });
			message = "Signed in. Local data will keep working and sync in the background.";
			setTimeout(() => {
				close();
				router.navigate("home");
			}, 500);
		} catch (e: any) {
			console.error(e);
			error = e?.message || "Failed to sign in";
			trackEvent("ave_login_failed", {
				error_name: e instanceof Error ? e.name : "unknown",
			});
		} finally {
			aveLoading = false;
		}
	}

	async function syncNow() {
		message = "";
		error = "";
		try {
			const result = await syncCloudBackupNow();
			if (result?.ok) {
				message = "Cloud backup synced successfully.";
				await refreshStats();
			} else {
				error = "Cloud backup is currently unavailable.";
			}
		} catch (e: any) {
			console.error("Failed to sync cloud backup", e);
			error = e?.message || "Failed to sync cloud backup";
		}
	}

	function installUpdate() {
		(window as any).electronAPI?.installUpdate?.();
	}

	$: if (showSettings) {
		refreshStats();
	}

	$: updateBodyLock(showSettings);

	onDestroy(() => {
		updateBodyLock(false);
	});
</script>


{#if showSettings}
	<div
		use:portal
		class="fixed inset-0 z-200 bg-[#101010]/56 backdrop-blur-xl flex items-center justify-center"
		transition:fade={{ duration: 200 }}
		on:click|self={close}
		on:keydown={(e) => e.key === "Escape" && close()}
		on:wheel|preventDefault|stopPropagation

		role="button"
		tabindex="0"
		style={withOverlayZoomStyle("padding: clamp(20px, 5vw, 150px);")}
	>
		<div
			class="w-full h-full rounded-4xl bg-[#2b2b2b]/56 backdrop-blur-[40px] p-6 md:p-8 flex flex-col gap-6 relative overflow-hidden shadow-[0_40px_160px_rgba(0,0,0,0.45)]"
			transition:scale={{ start: 0.95, duration: 200 }}
			on:wheel|stopPropagation
		>
			<div class="relative z-10 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
				<div>
					<h2 class="text-white text-3xl font-poppins font-bold">
						Settings
					</h2>
					<p class="text-white/60 text-sm">
						Personalize Raffi with an account-first layout and cleaner controls.
					</p>
				</div>
				<div class="flex items-center gap-3 justify-end">
					<button
						on:click={close}
						class="text-white/50 hover:text-white cursor-pointer transition-colors"
						aria-label="Close settings"
					>
						<X size={24} strokeWidth={2} />
					</button>
				</div>
			</div>

			<div class="relative z-10 flex-1 min-h-0 overflow-hidden">
				<div class="grid h-full min-w-0 gap-6 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
					<div class="min-h-0 min-w-0 overflow-y-auto pr-1 md:pr-3">
						<div class="flex flex-col gap-5 pb-1">
								{#if $localMode}
									<LocalModeSignInSection aveLoading={aveLoading} onAveLogin={handleAveLogin} />
								{:else if $currentUser}
									<AccountSection
										{error}
										onSyncNow={syncNow}
										onDownloadData={downloadData}
										onRequestSignOut={openSignOutModal}
									/>
								{:else}
									<AccountStateMismatchSection onRecoverToLocalMode={recoverToLocalMode} />
								{/if}

								<PrivacySection />

								<UpdateSection
									available={$updateStatus.available}
									version={$updateStatus.version}
									downloaded={$updateStatus.downloaded}
									notes={$updateStatus.notes}
									{showUpdateNotes}
									onInstallUpdate={installUpdate}
									onToggleNotes={() => (showUpdateNotes = !showUpdateNotes)}
								/>
						</div>
					</div>

					<div class="min-h-0 min-w-0 overflow-y-auto pl-0 md:pl-3">
						<div class="flex flex-col gap-5 pb-1">
								<ActivitySection
									moviesWatched={stats.moviesWatched}
									showsWatched={stats.showsWatched}
								/>

								<FeedbackSection {openExternalLink} />

								<PreferencesSection />

								<LocalLibrarySection />
							</div>
					</div>
				</div>
			</div>

			{#if showSignOutModal}
				<div
					class="absolute inset-0 z-20 flex items-center justify-center bg-black/55 backdrop-blur-sm"
					on:click|self={closeSignOutModal}
					on:keydown={(e) => e.key === "Escape" && closeSignOutModal()}
					role="button"
					tabindex="0"
				>
					<div
						class="w-full max-w-xl rounded-[28px] bg-[#303030]/62 backdrop-blur-[40px] p-6 md:p-7 flex flex-col gap-5 shadow-[0_30px_100px_rgba(0,0,0,0.38)]"
						on:click|stopPropagation
						on:keydown|stopPropagation
						role="dialog"
						tabindex="-1"
					>
						<div class="flex flex-col gap-2">
							<h3 class="text-white text-2xl font-semibold">Sign out</h3>
							<p class="text-white/60 text-sm">
								Choose whether you want Raffi to copy your synced data back to this device before switching to local mode.
							</p>
						</div>

						<div class="grid gap-3 md:grid-cols-2">
							<button
								class="rounded-2xl bg-white/10 text-white p-5 text-left hover:bg-white/20 transition-colors cursor-pointer"
								on:click={() => switchToLocalMode(true)}
							>
								<span class="block text-base font-semibold">Keep synced data</span>
								<span class="mt-2 block text-sm text-white/65">Copy your synced library and lists onto this device, then continue in local mode.</span>
							</button>
							<button
								class="rounded-2xl bg-white/10 text-white p-5 text-left hover:bg-white/20 transition-colors cursor-pointer"
								on:click={() => switchToLocalMode(false)}
							>
								<span class="block text-base font-semibold">Start fresh</span>
								<span class="mt-2 block text-sm text-white/65">Sign out and clear the synced copy from this device so you can start over locally.</span>
							</button>
						</div>

						<div class="flex justify-end">
							<button
								class="px-4 py-2 rounded-2xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors cursor-pointer"
								on:click={closeSignOutModal}
							>
								Cancel
							</button>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

