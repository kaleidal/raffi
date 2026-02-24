<script lang="ts">
    import { createEventDispatcher, onDestroy, onMount } from "svelte";
	import { X } from "lucide-svelte";
    import { fade, scale } from "svelte/transition";
	import {
		getLibrary,
		getListsWithItems,
	} from "../../../lib/db/db";
	import { clearLocalState, syncLocalStateToUser, syncUserStateToLocal } from "../../../lib/db/db";
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
	import ActivitySection from "./settings/ActivitySection.svelte";
	import FeedbackSection from "./settings/FeedbackSection.svelte";
	import UpdateSection from "./settings/UpdateSection.svelte";
	import LocalModeSignInSection from "./settings/LocalModeSignInSection.svelte";
	import PreferencesSection from "./settings/PreferencesSection.svelte";
	import PrivacySection from "./settings/PrivacySection.svelte";
	import LocalLibrarySection from "./settings/LocalLibrarySection.svelte";
	import DataBackupsSection from "./settings/DataBackupsSection.svelte";
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

	const dispatch = createEventDispatcher();

	let stats = {
		moviesWatched: 0,
		showsWatched: 0,
	};

	let message = "";
	let error = "";
	let showUpdateNotes = false;
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
		showSettings = false;
		dispatch("close");
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
				window.open(target, "_blank", "noopener,noreferrer");
			});
			return;
		}

		window.open(target, "_blank", "noopener,noreferrer");
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
		try {
			if (keepData) {
				await syncUserStateToLocal($currentUser.id);
			} else {
				clearLocalState();
			}
			signOutToLocalMode();
			await refreshStats();
			trackEvent("local_mode_switched", { keep_data: keepData });
			message = "Switched to local mode.";
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
			message = "Signed in with Ave.";
			setTimeout(() => {
				close();
				router.navigate("home");
			}, 500);
		} catch (e: any) {
			console.error(e);
			error = e?.message || "Failed to sign in with Ave";
			trackEvent("ave_login_failed", {
				error_name: e instanceof Error ? e.name : "unknown",
			});
		} finally {
			aveLoading = false;
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
		class="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center"
		transition:fade={{ duration: 200 }}
		on:click|self={close}
		on:keydown={(e) => e.key === "Escape" && close()}
		on:wheel|preventDefault|stopPropagation

		role="button"
		tabindex="0"
		style="padding: clamp(20px, 5vw, 150px);"
	>
		<div
			class="bg-[#121212] w-full max-w-5xl max-h-[90vh] rounded-[32px] p-6 md:p-10 flex flex-col gap-8 relative overflow-hidden shadow-[0_40px_160px_rgba(0,0,0,0.55)]"
			transition:scale={{ start: 0.95, duration: 200 }}
			on:wheel|stopPropagation
		>

			<div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
				<div>
					<h2 class="text-white text-3xl font-poppins font-bold">
						Settings
					</h2>
					<p class="text-white/60 text-sm">
						Personalize Raffi and keep your account tidy.
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

			<UpdateSection
				available={$updateStatus.available}
				version={$updateStatus.version}
				downloaded={$updateStatus.downloaded}
				notes={$updateStatus.notes}
				{showUpdateNotes}
				onInstallUpdate={installUpdate}
				onToggleNotes={() => (showUpdateNotes = !showUpdateNotes)}
			/>

			<div class="flex-1 min-h-0 overflow-y-auto">

				<div class="flex flex-col gap-6 min-h-0 pr-1 pb-1">
					{#if $localMode}
						<LocalModeSignInSection aveLoading={aveLoading} onAveLogin={handleAveLogin} />
					{/if}

					<ActivitySection
						moviesWatched={stats.moviesWatched}
						showsWatched={stats.showsWatched}
					/>

					<PreferencesSection />

					<PrivacySection />

					<FeedbackSection {openExternalLink} />

					<LocalLibrarySection />

					{#if !$localMode && $currentUser}
						<div class="grid gap-6 lg:grid-cols-[1fr,1.2fr]">
							<DataBackupsSection onDownloadData={downloadData} />
							<AccountSection
								{message}
								{error}
								onSwitchToLocalMode={switchToLocalMode}
							/>
						</div>
					{:else if !$localMode && !$currentUser}
						<AccountStateMismatchSection onRecoverToLocalMode={recoverToLocalMode} />
					{/if}
				</div>

			</div>
		</div>
	</div>
{/if}

