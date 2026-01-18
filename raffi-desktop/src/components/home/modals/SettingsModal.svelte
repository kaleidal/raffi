<script lang="ts">
	import { createEventDispatcher, onDestroy, onMount } from "svelte";

	import { fade, scale } from "svelte/transition";
	import { getLibrary, getListsWithItems } from "../../../lib/db/db";
	import { enableRPC, disableRPC } from "../../../lib/rpc";
	import {
		getRoots as getLocalRoots,
		setRoots as setLocalRoots,
		scanAndIndex,
	} from "../../../lib/localLibrary/localLibrary";
	import { supabase } from "../../../lib/db/supabase";
	import { clearLocalState, syncUserStateToLocal } from "../../../lib/db/db";
	import {
		currentUser,
		disableLocalMode,
		enableLocalMode,
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
	let newEmail = "";
	let newPassword = "";
	let message = "";
	let error = "";
	let analyticsEnabled = false;
	let sessionReplayEnabled = false;
	let analyticsAvailable = false;
	let showUpdateNotes = false;

	const formatUpdateNotes = (notes: string) => {
		const trimmed = notes?.trim();
		if (!trimmed) return "";
		if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;
		return trimmed.replace(/\n/g, "<br />");
	};


	let localLibrarySupported = false;
	let localRoots: string[] = [];
	let scanningLocal = false;
	let localScanMessage = "";
	let bodyLocked = false;


	onMount(async () => {
		try {
			const library = await getLibrary(1000);
			stats.moviesWatched = library.filter(
				(i) => i.type === "movie" || !i.type,
			).length;
			stats.showsWatched = library.filter((i) => i.type === "series").length;
		} catch (e) {
			console.error("Failed to load stats", e);
		}

		const storedRpc = localStorage.getItem("discord_rpc_enabled");
		discordRpcEnabled = storedRpc !== null ? storedRpc === "true" : true;

		const storedSeek = localStorage.getItem("seek_bar_style");
		seekBarStyle = storedSeek || "raffi";

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

		if ($currentUser?.email) {
			email = $currentUser.email;
		}
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


	async function handleLogout() {
		if ($localMode) {
			disableLocalMode();
			router.navigate("login");
			return;
		}
		await supabase.auth.signOut();
		router.navigate("login");
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
			await supabase.auth.signOut();
			enableLocalMode();
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


	async function updateEmail() {
		if (!newEmail) return;
		message = "";
		error = "";
		try {
			const { error: err } = await supabase.auth.updateUser({
				email: newEmail,
			});
			if (err) throw err;
			message = "Check your new email for a confirmation link.";
			newEmail = "";
		} catch (e: any) {
			error = e.message;
		}
	}

	async function updatePassword() {
		if (!newPassword) return;
		message = "";
		error = "";
		try {
			const { error: err } = await supabase.auth.updateUser({
				password: newPassword,
			});
			if (err) throw err;
			message = "Password updated successfully.";
			newPassword = "";
		} catch (e: any) {
			error = e.message;
		}
	}

	function goToLogin() {
		if ($localMode) {
			disableLocalMode();
		}
		trackEvent("login_requested", { source: "settings" });
		router.navigate("login");
		close();
	}

	function installUpdate() {
		(window as any).electronAPI?.installUpdate?.();
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
					{#if $localMode}
						<button
							class="bg-white text-black px-4 py-2 rounded-2xl font-semibold hover:bg-white/90 transition-colors cursor-pointer"
							on:click={goToLogin}
						>
							Log In
						</button>
					{/if}
					<button
						on:click={close}
						class="text-white/50 hover:text-white cursor-pointer transition-colors"
						aria-label="Close settings"
					>
						<svg
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							><line x1="18" y1="6" x2="6" y2="18"></line><line
								x1="6"
								y1="6"
								x2="18"
								y2="18"
							></line></svg>
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
						<div class="rounded-2xl bg-white/[0.06] p-4 text-white/70 text-sm whitespace-pre-wrap max-h-[200px] overflow-y-auto">
							{@html formatUpdateNotes($updateStatus.notes || "Release notes unavailable.")}
						</div>
					{/if}
				</section>
			{/if}

			<div class="flex-1 min-h-0 overflow-y-auto">

				<div class="flex flex-col gap-6 min-h-0 pr-1 pb-1">
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
							<a
								href="https://stator.sh/bugs/lantharos/raffi"
								target="_blank"
								rel="noreferrer"
								class="rounded-2xl bg-white/[0.08] p-4 text-white font-medium hover:bg-white/[0.14] transition-colors"
							>
								Report a bug
								<span class="block text-white/50 text-sm mt-1">Open the bug tracker</span>
							</a>
							<a
								href="https://stator.sh/feedback/lantharos/raffi"
								target="_blank"
								rel="noreferrer"
								class="rounded-2xl bg-white/[0.08] p-4 text-white font-medium hover:bg-white/[0.14] transition-colors"
							>
								Request a feature
								<span class="block text-white/50 text-sm mt-1">Share your ideas</span>
							</a>
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

					{#if !$localMode}
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
									<p class="text-white break-all">{email}</p>
								</div>

								<div class="space-y-2">
									<p class="text-white font-medium">Change Email</p>
									<div class="flex flex-col gap-3 sm:flex-row">
										<input
											type="email"
											placeholder="New email"
											bind:value={newEmail}
											class="flex-1 bg-black/30 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/30 outline-none focus:border-white/40 transition-colors"
										/>
										<button
											class="bg-white text-black px-6 py-3 rounded-2xl font-semibold hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
											on:click={updateEmail}
											disabled={!newEmail}
										>
											Update
										</button>
									</div>
								</div>

								<div class="space-y-2">
									<p class="text-white font-medium">Change Password</p>
									<div class="flex flex-col gap-3 sm:flex-row">
										<input
											type="password"
											placeholder="New password"
											bind:value={newPassword}
											class="flex-1 bg-black/30 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/30 outline-none focus:border-white/40 transition-colors"
										/>
										<button
											class="bg-white text-black px-6 py-3 rounded-2xl font-semibold hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
											on:click={updatePassword}
											disabled={!newPassword}
										>
											Update
										</button>
									</div>
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

								{#if $currentUser && !$localMode}
									<div class="rounded-2xl bg-white/[0.06] p-4 space-y-3">
										<div>
											<p class="text-white font-medium">Switch to local mode</p>
											<p class="text-white/60 text-sm">
												Use Raffi without syncing. Choose whether to copy your
												current data into local storage.
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
								{/if}

								<button
									class="w-full py-3 rounded-2xl bg-red-500/10 text-red-300 font-semibold hover:bg-red-500/20 transition-colors cursor-pointer"
									on:click={handleLogout}
								>
									Log Out
								</button>

							</div>
						</section>
					</div>
					{/if}
				</div>

			</div>
		</div>
	</div>
{/if}
