<script lang="ts">
    import { createEventDispatcher, onDestroy, onMount } from "svelte";
    import { ChevronDown, X } from "lucide-svelte";
    import { fade, scale } from "svelte/transition";
	import {
		getLibrary,
		getAddons,
		getListsWithItems,
		getTraktStatus,
		disconnectTrakt as disconnectTraktFromDb,
		type TraktStatus,
	} from "../../../lib/db/db";
	import { enableRPC, disableRPC } from "../../../lib/rpc";
	import {
		getRoots as getLocalRoots,
		setRoots as setLocalRoots,
		scanAndIndex,
	} from "../../../lib/localLibrary/localLibrary";
	import { clearLocalState, syncLocalStateToUser, syncUserStateToLocal } from "../../../lib/db/db";
	import { importLegacySupabaseDataToLocal } from "../../../lib/db/supabaseLegacy";
	import { signInWithTraktViaBrowser } from "../../../lib/auth/traktAuth";
	import {
		currentUser,
		signInWithAve,
		signOutToLocalMode,
		localMode,
		updateStatus,
	} from "../../../lib/stores/authStore";
	import { router } from "../../../lib/stores/router";
	import {
		getAnalyticsSettings,
		isAnalyticsAvailable,
		setAnalyticsSettings,
		trackEvent,
	} from "../../../lib/analytics";
	import { formatReleaseNotes } from "../../../lib/updateNotes";
	import {
		getHeroCatalogSourceOptions,
		type HeroCatalogSourceOption,
	} from "../../../lib/library/addonCatalogs";
	import {
		HOME_HERO_SOURCE_CINEMETA,
		getStoredHomeHeroSource,
		setStoredHomeHeroSource,
	} from "../../../lib/home/heroSettings";
	import {
		HOME_SEARCH_BAR_POSITION_AUTO,
		HOME_SEARCH_BAR_POSITION_BOTTOM,
		HOME_SEARCH_BAR_POSITION_CHANGED_EVENT,
		HOME_SEARCH_BAR_POSITION_HEADER,
		type HomeSearchBarPosition,
		getStoredHomeSearchBarPosition,
		setStoredHomeSearchBarPosition,
	} from "../../../lib/home/searchBarSettings";

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

	let discordRpcEnabled = true;
	let seekBarStyle = "raffi";
	let email = "";
	let message = "";
	let error = "";
	let analyticsEnabled = false;
	let sessionReplayEnabled = false;
	let analyticsAvailable = false;
	let showUpdateNotes = false;
	let legacyEmail = "";
	let legacyPassword = "";
	let loginMessage = "";
	let loginError = "";
	let aveLoading = false;
	let legacyLoading = false;
	let traktStatus: TraktStatus | null = null;
	let traktLoading = false;
	let traktBusy = false;
	let traktMessage = "";
	let traktError = "";
	let traktStatusRequested = false;

	let localLibrarySupported = false;
	let localRoots: string[] = [];
	let scanningLocal = false;
	let localScanMessage = "";
	let heroSource = HOME_HERO_SOURCE_CINEMETA;
	let heroSourceOptions: HeroCatalogSourceOption[] = [];
	let heroSourceLoading = false;
	let heroSourceRequested = false;
	let searchBarPosition: HomeSearchBarPosition = HOME_SEARCH_BAR_POSITION_AUTO;
	let bodyLocked = false;
	const HOME_REFRESH_EVENT = "raffi:home-refresh";

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

		const storedRpc = localStorage.getItem("discord_rpc_enabled");
		discordRpcEnabled = storedRpc !== null ? storedRpc === "true" : true;

		const storedSeek = localStorage.getItem("seek_bar_style");
		seekBarStyle = storedSeek || "raffi";
		heroSource = getStoredHomeHeroSource();
		searchBarPosition = getStoredHomeSearchBarPosition();

		analyticsAvailable = isAnalyticsAvailable();
		const analyticsSettings = getAnalyticsSettings();
		analyticsEnabled = analyticsSettings.enabled;
		sessionReplayEnabled = analyticsSettings.sessionReplay;

		localLibrarySupported =

			typeof window !== "undefined" &&
			!!(window as any).electronAPI?.localLibrary;
		if (localLibrarySupported) {
			localRoots = getLocalRoots();
		}

		email = $currentUser?.email || "";
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

	const emitHomeRefresh = () => {
		window.dispatchEvent(new CustomEvent(HOME_REFRESH_EVENT));
	};

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


	function toggleRpc() {
		discordRpcEnabled = !discordRpcEnabled;
		localStorage.setItem("discord_rpc_enabled", discordRpcEnabled.toString());
		if (discordRpcEnabled) {
			enableRPC();
		} else {
			disableRPC();
		}
	}

	function toggleSeekBar() {
		seekBarStyle = seekBarStyle === "raffi" ? "normal" : "raffi";
		localStorage.setItem("seek_bar_style", seekBarStyle);
	}

	function toggleAnalytics() {
		analyticsEnabled = !analyticsEnabled;
		if (!analyticsEnabled) {
			sessionReplayEnabled = false;
		}
		setAnalyticsSettings({
			enabled: analyticsEnabled,
			sessionReplay: sessionReplayEnabled,
		});
		trackEvent("analytics_toggled", { enabled: analyticsEnabled });
	}

	function toggleSessionReplay() {
		if (!analyticsEnabled) return;
		sessionReplayEnabled = !sessionReplayEnabled;
		setAnalyticsSettings({
			enabled: analyticsEnabled,
			sessionReplay: sessionReplayEnabled,
		});
		trackEvent("session_replay_toggled", {
			enabled: sessionReplayEnabled,
		});
	}

	async function loadHeroSourceOptions() {
		heroSourceLoading = true;
		try {
			const addons = await getAddons();
			heroSourceOptions = getHeroCatalogSourceOptions(addons);
			if (
				heroSource !== HOME_HERO_SOURCE_CINEMETA &&
				!heroSourceOptions.some((option) => option.id === heroSource)
			) {
				heroSource = HOME_HERO_SOURCE_CINEMETA;
				setStoredHomeHeroSource(HOME_HERO_SOURCE_CINEMETA);
				emitHomeRefresh();
			}
		} catch (e) {
			console.error("Failed to load hero source options", e);
			heroSourceOptions = [];
		} finally {
			heroSourceLoading = false;
		}
	}

	function setHeroSource(sourceId: string) {
		const next =
			sourceId && sourceId.length > 0
				? sourceId
				: HOME_HERO_SOURCE_CINEMETA;
		if (next === heroSource) return;
		heroSource = next;
		setStoredHomeHeroSource(next);
		emitHomeRefresh();
		trackEvent("home_hero_source_changed", {
			source:
				next === HOME_HERO_SOURCE_CINEMETA
					? "cinemeta"
					: "addon_catalog",
		});
	}

	function setSearchBarPosition(value: string) {
		const next =
			value === HOME_SEARCH_BAR_POSITION_BOTTOM
				? HOME_SEARCH_BAR_POSITION_BOTTOM
				: value === HOME_SEARCH_BAR_POSITION_AUTO
					? HOME_SEARCH_BAR_POSITION_AUTO
					: HOME_SEARCH_BAR_POSITION_HEADER;

		if (next === searchBarPosition) return;
		searchBarPosition = next;
		setStoredHomeSearchBarPosition(next);
		window.dispatchEvent(
			new CustomEvent(HOME_SEARCH_BAR_POSITION_CHANGED_EVENT, {
				detail: { position: next },
			}),
		);
		trackEvent("home_search_bar_position_changed", { position: next });
	}


	async function addLocalFolder() {
		if (!localLibrarySupported) return;
		localScanMessage = "";
		try {
			const picked = await (window as any).electronAPI.localLibrary.pickFolder();
			if (!picked) return;
			localRoots = Array.from(new Set([...(localRoots || []), picked]));
			setLocalRoots(localRoots);
			trackEvent("local_library_root_added", {
				root_count: localRoots.length,
			});
		} catch (e) {
			console.error("Failed to pick folder", e);
			localScanMessage = "Failed to pick folder";
			trackEvent("local_library_root_add_failed", {
				error_name: e instanceof Error ? e.name : "unknown",
			});
		}
	}


	function removeLocalFolder(folder: string) {
		localRoots = (localRoots || []).filter((p) => p !== folder);
		setLocalRoots(localRoots);
		trackEvent("local_library_root_removed", {
			root_count: localRoots.length,
		});
	}


	async function rescanLocalLibrary() {
		if (!localLibrarySupported) return;
		scanningLocal = true;
		localScanMessage = "Scanning…";
		trackEvent("local_library_scan_started", {
			root_count: localRoots.length,
		});
		try {
			const res = await scanAndIndex();
			localScanMessage = res ? `Indexed ${res.entries} files` : "Not available";
			trackEvent("local_library_scan_completed", {
				entries: res?.entries ?? 0,
				success: Boolean(res),
			});
		} catch (e) {
			console.error("Local library scan failed", e);
			localScanMessage = "Scan failed";
			trackEvent("local_library_scan_failed", {
				error_name: e instanceof Error ? e.name : "unknown",
			});
		} finally {
			scanningLocal = false;
		}
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
		loginError = "";
		loginMessage = "";
		aveLoading = true;
		try {
			await signInWithAve();
			await refreshStats();
			trackEvent("ave_login_success", { source: "settings" });
			loginMessage = "Signed in with Ave.";
			setTimeout(() => {
				close();
				router.navigate("home");
			}, 500);
		} catch (e: any) {
			console.error(e);
			loginError = e?.message || "Failed to sign in with Ave";
			trackEvent("ave_login_failed", {
				error_name: e instanceof Error ? e.name : "unknown",
			});
		} finally {
			aveLoading = false;
		}
	}

	async function importFromLegacySupabase() {
		if (!legacyEmail || !legacyPassword) {
			loginError = "Enter your old Supabase email and password";
			return;
		}
		legacyLoading = true;
		loginError = "";
		loginMessage = "";
		try {
			const counts = await importLegacySupabaseDataToLocal(legacyEmail, legacyPassword);
			if ($currentUser && !$localMode) {
				await syncLocalStateToUser($currentUser.id);
			}
			await refreshStats();
			loginMessage = $currentUser && !$localMode
				? `Imported ${counts.addons} addons, ${counts.library} history items, ${counts.lists} lists and synced to your Ave account.`
				: `Imported ${counts.addons} addons, ${counts.library} history items, ${counts.lists} lists.`;
			emitHomeRefresh();
			trackEvent("legacy_supabase_import_success", counts as any);
			legacyPassword = "";
		} catch (e: any) {
			loginError = e?.message || "Failed to import from legacy Supabase";
			trackEvent("legacy_supabase_import_failed", {
				error_name: e instanceof Error ? e.name : "unknown",
			});
		} finally {
			legacyLoading = false;
		}
	}

	function installUpdate() {
		(window as any).electronAPI?.installUpdate?.();
	}

	$: if (showSettings) {
		refreshStats();
	}

	$: if (showSettings && !heroSourceRequested) {
		heroSourceRequested = true;
		void loadHeroSourceOptions();
	}

	$: if (showSettings && !$localMode && $currentUser && !traktStatusRequested) {
		traktStatusRequested = true;
		void loadTraktStatus();
	}

	$: if (!showSettings) {
		traktStatusRequested = false;
		heroSourceRequested = false;
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

			{#if $updateStatus.available}
				<section class="rounded-[28px] bg-white/[0.04] p-6 flex flex-col gap-4">
					<div class="flex flex-col gap-1">
						<h3 class="text-white text-xl font-semibold">Update available</h3>
						<p class="text-white/60 text-sm">
							{#if $updateStatus.version}
								Version {$updateStatus.version} is ready to install.
							{:else}
								A new version is ready to install.
							{/if}
						</p>
					</div>
					<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
						{#if $updateStatus.downloaded}
							<button
								class="bg-white text-black px-4 py-2 rounded-2xl font-semibold hover:bg-white/90 transition-colors cursor-pointer"
								on:click={installUpdate}
							>
								Restart to update
							</button>
						{:else}
							<span class="text-white/50 text-sm">Downloading update…</span>
						{/if}
						<button
							class="text-white/70 text-sm underline underline-offset-4 hover:text-white"
							on:click={() => (showUpdateNotes = !showUpdateNotes)}
						>
							{showUpdateNotes ? "Hide changes" : "View changes"}
						</button>
					</div>
					{#if showUpdateNotes}
						<div class="release-notes-content rounded-2xl bg-white/[0.06] p-4 text-white/70 text-sm max-h-[200px] overflow-y-auto">
							{@html formatReleaseNotes($updateStatus.notes || "Release notes unavailable.")}
						</div>
					{/if}
				</section>
			{/if}

			<div class="flex-1 min-h-0 overflow-y-auto">

				<div class="flex flex-col gap-6 min-h-0 pr-1 pb-1">
					{#if $localMode}
						<section class="rounded-[28px] bg-white/[0.04] p-6 flex flex-col gap-5">
							<div>
								<h3 class="text-white text-xl font-semibold">Sign In With Ave</h3>
								<p class="text-white/60 text-sm">
									Use your Ave account to sync your library and lists across devices.
								</p>
							</div>
							<div class="rounded-2xl bg-white/[0.08] p-5 space-y-4">
								<button
									class="w-full bg-white text-black px-6 py-3 rounded-2xl font-semibold hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
									on:click={handleAveLogin}
									disabled={aveLoading}
								>
									{aveLoading ? "Opening browser..." : "Continue with Ave"}
								</button>
							</div>
						</section>
					{/if}

					<section class="rounded-[28px] bg-white/[0.04] p-6 flex flex-col gap-5">
						<div>
							<h3 class="text-white text-xl font-semibold">Legacy Supabase import</h3>
							<p class="text-white/60 text-sm">
								One-time import of your old Supabase data.
								{#if $currentUser && !$localMode}
									 Imported data will be synced to your Ave account.
								{:else}
									 Imported data will be stored in local mode.
								{/if}
							</p>
						</div>
						<div class="rounded-2xl bg-white/[0.08] p-5 space-y-4">
							<div class="space-y-2">
								<input
									type="email"
									placeholder="Old Supabase email"
									bind:value={legacyEmail}
									class="w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/30 outline-none focus:border-white/40 transition-colors"
								/>
								<input
									type="password"
									placeholder="Old Supabase password"
									bind:value={legacyPassword}
									on:keydown={(e) => e.key === "Enter" && importFromLegacySupabase()}
									class="w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/30 outline-none focus:border-white/40 transition-colors"
								/>
							</div>

							<button
								class="w-full bg-white/10 text-white px-6 py-3 rounded-2xl font-semibold hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
								on:click={importFromLegacySupabase}
								disabled={!legacyEmail || !legacyPassword || legacyLoading}
							>
								{legacyLoading ? "Importing..." : "Import Legacy Data"}
							</button>

							{#if loginMessage}
								<div class="p-3 rounded-2xl bg-green-500/10 border border-green-500/20 text-green-300 text-sm">
									{loginMessage}
								</div>
							{/if}
							{#if loginError}
								<div class="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
									{loginError}
								</div>
							{/if}
						</div>
					</section>

					<section class="rounded-[28px] bg-white/[0.04] p-6 flex flex-col gap-5">
						<div>
							<h3 class="text-white text-xl font-semibold">
								Activity
							</h3>
							<p class="text-white/60 text-sm">
								Track how much you've finished recently.
							</p>
						</div>
						<div class="grid gap-4 sm:grid-cols-2">
							<div class="rounded-2xl bg-white/[0.08] p-4">
								<p class="text-white/60 text-xs uppercase tracking-[0.3em]">
									Movies
								</p>
								<p class="text-white text-4xl font-bold">
									{stats.moviesWatched}
								</p>
							</div>
							<div class="rounded-2xl bg-white/[0.08] p-4">
								<p class="text-white/60 text-xs uppercase tracking-[0.3em]">
									Shows
								</p>
								<p class="text-white text-4xl font-bold">
									{stats.showsWatched}
								</p>
							</div>
						</div>
					</section>

					<section class="rounded-[28px] bg-white/[0.04] p-6 flex flex-col gap-5">
						<div>
							<h3 class="text-white text-xl font-semibold">
								Preferences
							</h3>
							<p class="text-white/60 text-sm">
								Control connected experiences and integrations.
							</p>
						</div>
						<div class="rounded-2xl bg-white/[0.08] p-4 flex flex-wrap items-center gap-4 justify-between">
							<div>
								<p class="text-white font-medium">
									Discord Rich Presence
								</p>
								<p class="text-white/60 text-sm">
									Let friends see what you're watching.
								</p>
							</div>
							<button
								class={`relative w-16 h-9 rounded-full border border-white/10 transition-colors duration-200 cursor-pointer ${
									discordRpcEnabled ? "bg-white" : "bg-white/10"
								}`}
								on:click={toggleRpc}
								aria-label="Toggle Discord Rich Presence"
								role="switch"
								aria-checked={discordRpcEnabled}
							>
								<span
									class={`absolute top-1 left-1 w-7 h-7 rounded-full text-[10px] font-semibold tracking-[0.2em] flex items-center justify-center transition-all duration-200 ${
										discordRpcEnabled
											? "translate-x-7 bg-black text-white/90"
											: "translate-x-0 bg-white/80 text-black"
									}`}
								>
									{discordRpcEnabled ? "ON" : "OFF"}
								</span>
							</button>
						</div>

						<div class="rounded-2xl bg-white/[0.08] p-4 flex flex-wrap items-center gap-4 justify-between">
							<div>
								<p class="text-white font-medium">
									Seek Bar Style
								</p>
								<p class="text-white/60 text-sm">
									Choose between Raffi (inverted) or Standard style.
								</p>
							</div>
							<button
								class="relative h-9 w-[160px] rounded-full border border-white/10 transition-colors duration-200 cursor-pointer bg-white/10 p-1"
								on:click={toggleSeekBar}
								aria-label="Toggle Seek Bar Style"
							>
								<div class="relative z-10 flex w-full h-full items-center">
									<span class={`flex-1 text-center text-xs font-semibold tracking-wider transition-colors duration-200 ${seekBarStyle === 'raffi' ? 'text-black' : 'text-white/60'}`}>RAFFI</span>
									<span class={`flex-1 text-center text-xs font-semibold tracking-wider transition-colors duration-200 ${seekBarStyle === 'normal' ? 'text-black' : 'text-white/60'}`}>NORMAL</span>
								</div>
								<div 
									class={`absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] bg-white rounded-full transition-transform duration-200 ${seekBarStyle === 'normal' ? 'translate-x-full' : 'translate-x-0'}`}
								></div>
							</button>
						</div>

						<div class="grid items-stretch gap-4 xl:grid-cols-2">
							<div class="rounded-2xl bg-white/[0.08] p-4 flex flex-col gap-3 h-full">
								<div>
									<p class="text-white font-medium">
										Search Bar Position
									</p>
									<p class="text-white/60 text-sm">
										Choose where the search bar is pinned on Home.
									</p>
									<p class="text-white/45 text-xs mt-2">
										In Auto mode, it moves to bottom after you scroll past the header.
									</p>
								</div>
								<div class="w-full mt-auto pt-2">
									<div class="relative group">
									<select
										class="w-full appearance-none bg-black/35 border border-white/10 rounded-2xl px-4 pr-12 py-3 text-white outline-none focus:border-white/40 transition-colors cursor-pointer hover:bg-black/45 hover:border-white/25"
										value={searchBarPosition}
										on:change={(e) =>
											setSearchBarPosition(
												(e.target as HTMLSelectElement).value,
											)}
									>
										<option value={HOME_SEARCH_BAR_POSITION_HEADER}>
											Header (Top)
										</option>
										<option value={HOME_SEARCH_BAR_POSITION_BOTTOM}>
											Bottom (Always)
										</option>
										<option value={HOME_SEARCH_BAR_POSITION_AUTO}>
											Auto (Bottom after Header)
										</option>
									</select>
										<div class="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/70 transition-colors group-hover:text-white/90">
											<ChevronDown size={18} strokeWidth={2.4} />
										</div>
									</div>
								</div>
							</div>

							<div class="rounded-2xl bg-white/[0.08] p-4 flex flex-col gap-3 h-full">
								<div>
									<p class="text-white font-medium">
										Home Hero Source
									</p>
									<p class="text-white/60 text-sm">
										Choose where the Home hero pulls featured titles from.
									</p>
									<p class="text-white/45 text-xs mt-2">
										Using addon catalogs may increase initial Home load time if the addon is slow.
									</p>
								</div>
								<div class="w-full mt-auto pt-2">
									<div class="relative group">
									<select
										class="w-full appearance-none bg-black/35 border border-white/10 rounded-2xl px-4 pr-12 py-3 text-white outline-none focus:border-white/40 transition-colors cursor-pointer hover:bg-black/45 hover:border-white/25 disabled:opacity-60 disabled:cursor-not-allowed"
										value={heroSource}
										on:change={(e) =>
											setHeroSource(
												(e.target as HTMLSelectElement).value,
											)}
										disabled={heroSourceLoading}
									>
										<option value={HOME_HERO_SOURCE_CINEMETA}>
											Cinemeta (Default)
										</option>
										{#each heroSourceOptions as option}
											<option value={option.id}>{option.label}</option>
										{/each}
									</select>
										<div class="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/70 transition-colors group-hover:text-white/90">
											<ChevronDown size={18} strokeWidth={2.4} />
										</div>
									</div>
								</div>
								{#if !heroSourceLoading && heroSourceOptions.length === 0}
									<p class="text-white/50 text-xs">
										No compatible catalog addons installed yet.
									</p>
								{/if}
							</div>
						</div>
					</section>

					<section class="rounded-[28px] bg-white/[0.04] p-6 flex flex-col gap-5">
						<div>
							<h3 class="text-white text-xl font-semibold">
								Privacy & Analytics
							</h3>
							<p class="text-white/60 text-sm">
								Help improve Raffi while keeping control of your data.
							</p>
						</div>
						<div class="rounded-2xl bg-white/[0.08] p-4 flex flex-wrap items-center gap-4 justify-between">
							<div>
								<p class="text-white font-medium">
									Share anonymous analytics
								</p>
								<p class="text-white/60 text-sm">
									Tracks feature usage and stream types without collecting titles or URLs.
								</p>
							</div>
							<button
								class={`relative w-16 h-9 rounded-full border border-white/10 transition-colors duration-200 ${analyticsAvailable ? "cursor-pointer" : "cursor-not-allowed opacity-50"} ${analyticsEnabled ? "bg-white" : "bg-white/10"}`}
								on:click={toggleAnalytics}
								disabled={!analyticsAvailable}
								aria-label="Toggle analytics"
								role="switch"
								aria-checked={analyticsEnabled}
							>
								<span
									class={`absolute top-1 left-1 w-7 h-7 rounded-full text-[10px] font-semibold tracking-[0.2em] flex items-center justify-center transition-all duration-200 ${analyticsEnabled ? "translate-x-7 bg-black text-white/90" : "translate-x-0 bg-white/80 text-black"}`}
								>
									{analyticsEnabled ? "ON" : "OFF"}
								</span>
							</button>
						</div>
						<div class="rounded-2xl bg-white/[0.08] p-4 flex flex-wrap items-center gap-4 justify-between">
							<div>
								<p class="text-white font-medium">
									Session replay
								</p>
								<p class="text-white/60 text-sm">
									Records UI flows to debug issues. Text inputs are masked.
								</p>
							</div>
							<button
								class={`relative w-16 h-9 rounded-full border border-white/10 transition-colors duration-200 ${analyticsAvailable && analyticsEnabled ? "cursor-pointer" : "cursor-not-allowed opacity-50"} ${sessionReplayEnabled ? "bg-white" : "bg-white/10"}`}
								on:click={toggleSessionReplay}
								disabled={!analyticsAvailable || !analyticsEnabled}
								aria-label="Toggle session replay"
								role="switch"
								aria-checked={sessionReplayEnabled}
							>
								<span
									class={`absolute top-1 left-1 w-7 h-7 rounded-full text-[10px] font-semibold tracking-[0.2em] flex items-center justify-center transition-all duration-200 ${sessionReplayEnabled ? "translate-x-7 bg-black text-white/90" : "translate-x-0 bg-white/80 text-black"}`}
								>
									{sessionReplayEnabled ? "ON" : "OFF"}
								</span>
							</button>
						</div>
						{#if !analyticsAvailable}
							<p class="text-white/50 text-sm">
								Analytics is not configured for this build.
							</p>
						{/if}
					</section>

					<section class="rounded-[28px] bg-white/[0.04] p-6 flex flex-col gap-5">
						<div>
							<h3 class="text-white text-xl font-semibold">Feedback</h3>
							<p class="text-white/60 text-sm">
								Share bugs or feature ideas to improve Raffi.
							</p>
						</div>
						<div class="grid gap-4 sm:grid-cols-2">
							<button
								type="button"
								on:click={() => openExternalLink("https://stator.sh/lantharos/raffi/bugs")}
								class="rounded-2xl bg-white/[0.08] p-4 text-white font-medium hover:bg-white/[0.14] transition-colors cursor-pointer text-left"
							>
								Report a bug
								<span class="block text-white/50 text-sm mt-1">Open the bug tracker</span>
							</button>
							<button
								type="button"
								on:click={() => openExternalLink("https://stator.sh/lantharos/raffi/feedback")}
								class="rounded-2xl bg-white/[0.08] p-4 text-white font-medium hover:bg-white/[0.14] transition-colors cursor-pointer text-left"
							>
								Request a feature
								<span class="block text-white/50 text-sm mt-1">Share your ideas</span>
							</button>
						</div>
					</section>

					{#if localLibrarySupported}

						<section class="rounded-[28px] bg-white/[0.04] p-6 flex flex-col gap-5">
							<div>
								<h3 class="text-white text-xl font-semibold">Local Library</h3>
								<p class="text-white/60 text-sm">
									Add a folder and Raffi will recognize files like S01E01 and offer them as “Local” streams.
								</p>
							</div>

							<div class="rounded-2xl bg-white/[0.08] p-5 flex flex-col gap-4">
								<div class="flex flex-wrap gap-3 items-center justify-between">
									<button
										class="bg-white text-black px-5 py-3 rounded-2xl font-semibold hover:bg-white/90 transition-colors cursor-pointer"
										on:click={addLocalFolder}
									>
										Add Folder
									</button>
									<button
										class={`px-5 py-3 rounded-2xl font-semibold transition-colors cursor-pointer ${scanningLocal ? 'bg-white/20 text-white/60' : 'bg-white/10 text-white hover:bg-white/20'}`}
										on:click={rescanLocalLibrary}
										disabled={scanningLocal}
									>
										Rescan
									</button>
								</div>

								{#if localScanMessage}
									<p class="text-white/60 text-sm">{localScanMessage}</p>
								{/if}

								{#if localRoots.length === 0}
									<p class="text-white/50 text-sm">No folders added yet.</p>
								{:else}
									<div class="flex flex-col gap-2">
										{#each localRoots as folder (folder)}
											<div class="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.06] px-4 py-3">
												<p class="text-white/80 text-sm break-all">{folder}</p>
												<button
													class="text-white/50 hover:text-white transition-colors cursor-pointer"
													on:click={() => removeLocalFolder(folder)}
													aria-label="Remove folder"
												>
													Remove
												</button>
											</div>
									{/each}
									</div>
								{/if}
							</div>
						</section>
					{/if}

					{#if !$localMode && $currentUser}
						<div class="grid gap-6 lg:grid-cols-[1fr,1.2fr]">
							<section class="rounded-[28px] bg-white/[0.04] p-6 flex flex-col gap-5">

							<div>
								<h3 class="text-white text-xl font-semibold">
									Data & Backups
								</h3>
								<p class="text-white/60 text-sm">
									Grab everything in one tidy JSON export.
								</p>
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
									on:click={downloadData}
								>
									Download JSON
								</button>
							</div>
						</section>

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
									<p class="text-white break-all">{$currentUser.email || "No email returned by Ave"}</p>
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
											on:click={() => switchToLocalMode(true)}
										>
											Keep synced data
										</button>
										<button
											class="flex-1 bg-white/10 text-white px-4 py-2 rounded-2xl font-semibold hover:bg-white/20 transition-colors cursor-pointer"
											on:click={() => switchToLocalMode(false)}
										>
											Start fresh
										</button>
									</div>
								</div>

							</div>
						</section>
					</div>
					{:else if !$localMode && !$currentUser}
						<section class="rounded-[28px] bg-white/[0.04] p-6 flex flex-col gap-4">
							<h3 class="text-white text-xl font-semibold">Account state mismatch</h3>
							<p class="text-white/60 text-sm">
								Raffi is in synced mode but no valid Ave session is available.
							</p>
							<button
								class="self-start bg-white text-black px-5 py-2 rounded-2xl font-semibold hover:bg-white/90 transition-colors cursor-pointer"
								on:click={recoverToLocalMode}
							>
								Switch to local mode
							</button>
						</section>
					{/if}
				</div>

			</div>
		</div>
	</div>
{/if}

<style>
	.release-notes-content :global(h1),
	.release-notes-content :global(h2),
	.release-notes-content :global(h3),
	.release-notes-content :global(h4) {
		color: white;
		font-weight: 700;
		line-height: 1.2;
		margin: 0 0 0.65rem;
	}

	.release-notes-content :global(h1) {
		font-size: 1.15rem;
	}

	.release-notes-content :global(h2) {
		font-size: 1.05rem;
	}

	.release-notes-content :global(h3),
	.release-notes-content :global(h4) {
		font-size: 0.98rem;
	}

	.release-notes-content :global(p),
	.release-notes-content :global(ul),
	.release-notes-content :global(ol),
	.release-notes-content :global(blockquote),
	.release-notes-content :global(pre) {
		margin: 0 0 0.65rem;
	}

	.release-notes-content :global(ul) {
		list-style: disc;
		padding-left: 1.2rem;
	}

	.release-notes-content :global(ol) {
		list-style: decimal;
		padding-left: 1.2rem;
	}

	.release-notes-content :global(li) {
		margin: 0.2rem 0;
	}

	.release-notes-content :global(code) {
		background: rgba(255, 255, 255, 0.09);
		border-radius: 0.35rem;
		padding: 0.1rem 0.35rem;
		color: white;
		font-size: 0.85em;
	}

	.release-notes-content :global(blockquote) {
		border-left: 2px solid rgba(255, 255, 255, 0.3);
		padding-left: 0.65rem;
		color: rgba(255, 255, 255, 0.72);
	}

	.release-notes-content :global(a) {
		color: white;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.release-notes-content :global(hr) {
		border: 0;
		border-top: 1px solid rgba(255, 255, 255, 0.18);
		margin: 0.75rem 0;
	}

	.release-notes-content :global(*:last-child) {
		margin-bottom: 0;
	}
</style>
