<script lang="ts">
	import { createEventDispatcher, onMount } from "svelte";
	import { fade, scale } from "svelte/transition";
	import { getLibrary, getListsWithItems } from "../../../lib/db/db";
	import { enableRPC, disableRPC } from "../../../lib/rpc";
	import {
		getRoots as getLocalRoots,
		setRoots as setLocalRoots,
		scanAndIndex,
	} from "../../../lib/localLibrary/localLibrary";
	import { supabase } from "../../../lib/db/supabase";
	import { currentUser } from "../../../lib/stores/authStore";
	import { router } from "../../../lib/stores/router";

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

	let localLibrarySupported = false;
	let localRoots: string[] = [];
	let scanningLocal = false;
	let localScanMessage = "";

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

	async function addLocalFolder() {
		if (!localLibrarySupported) return;
		localScanMessage = "";
		try {
			const picked = await (window as any).electronAPI.localLibrary.pickFolder();
			if (!picked) return;
			localRoots = Array.from(new Set([...(localRoots || []), picked]));
			setLocalRoots(localRoots);
		} catch (e) {
			console.error("Failed to pick folder", e);
			localScanMessage = "Failed to pick folder";
		}
	}

	function removeLocalFolder(folder: string) {
		localRoots = (localRoots || []).filter((p) => p !== folder);
		setLocalRoots(localRoots);
	}

	async function rescanLocalLibrary() {
		if (!localLibrarySupported) return;
		scanningLocal = true;
		localScanMessage = "Scanning…";
		try {
			const res = await scanAndIndex();
			localScanMessage = res ? `Indexed ${res.entries} files` : "Not available";
		} catch (e) {
			console.error("Local library scan failed", e);
			localScanMessage = "Scan failed";
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
		} catch (e) {
			console.error("Failed to download data", e);
			error = "Failed to download data";
		}
	}

	async function handleLogout() {
		await supabase.auth.signOut();
		router.navigate("login");
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
</script>

{#if showSettings}
	<div
		class="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center"
		transition:fade={{ duration: 200 }}
		on:click|self={close}
		on:keydown={(e) => e.key === "Escape" && close()}
		on:wheel|stopPropagation
		role="button"
		tabindex="0"
		style="padding: clamp(20px, 5vw, 150px);"
	>
		<div
			class="bg-[#121212] w-full max-w-5xl max-h-[90vh] rounded-[32px] p-6 md:p-10 flex flex-col gap-8 relative overflow-hidden shadow-[0_40px_160px_rgba(0,0,0,0.55)]"
			transition:scale={{ start: 0.95, duration: 200 }}
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
				<button
					on:click={close}
					class="self-end text-white/50 hover:text-white cursor-pointer transition-colors"
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
						></line></svg
				></button>
			</div>

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

								<button
									class="w-full py-3 rounded-2xl bg-red-500/10 text-red-300 font-semibold hover:bg-red-500/20 transition-colors cursor-pointer"
									on:click={handleLogout}
								>
									Log Out
								</button>
							</div>
						</section>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
