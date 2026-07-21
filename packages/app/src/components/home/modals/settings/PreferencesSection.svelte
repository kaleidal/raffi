<script lang="ts">
	import { onMount } from "svelte";
	import UiScaleControl from "./UiScaleControl.svelte";
	import SearchBarPositionCard from "./SearchBarPositionCard.svelte";
	import HeroSourceCard from "./HeroSourceCard.svelte";
	import DirectSourceSection from "./DirectSourceSection.svelte";
	import { enableRPC, disableRPC } from "../../../../lib/rpc";
	import { getAddons, getTraktStatus } from "../../../../lib/db/db";
	import { trackEvent } from "../../../../lib/analytics";
	import {
		autoSkipIntros,
		miniPlayerOnMinimize,
	} from "../../../../lib/stores/playbackPreferences";
	import {
		allowTorrenting,
		setTorrentingAllowed,
	} from "../../../../lib/stores/torrenting";
	import { currentUser, localMode } from "../../../../lib/stores/authStore";
	import {
		getHeroCatalogSourceOptions,
		type HeroCatalogSourceOption,
	} from "../../../../lib/library/addonCatalogs";
	import {
		HOME_HERO_SOURCE_CINEMETA,
		HOME_HERO_SOURCE_TRAKT_RECOMMENDATIONS,
		getStoredHomeHeroSource,
		setStoredHomeHeroSource,
	} from "../../../../lib/home/heroSettings";
	import {
		HOME_SEARCH_BAR_POSITION_AUTO,
		HOME_SEARCH_BAR_POSITION_BOTTOM,
		HOME_SEARCH_BAR_POSITION_CHANGED_EVENT,
		HOME_SEARCH_BAR_POSITION_HEADER,
		type HomeSearchBarPosition,
		getStoredHomeSearchBarPosition,
		setStoredHomeSearchBarPosition,
	} from "../../../../lib/home/searchBarSettings";

	let discordRpcEnabled = true;
	let seekBarStyle = "raffi";
	let miniPlayerEnabled = true;
	let searchBarPosition: HomeSearchBarPosition = HOME_SEARCH_BAR_POSITION_AUTO;
	let heroSource = HOME_HERO_SOURCE_CINEMETA;
	let heroSourceOptions: HeroCatalogSourceOption[] = [];
	let heroSourceLoading = false;
	let traktHeroSourceAvailable = false;
	let torrentingSaving = false;
	let torrentingError = "";
	const isWindowsDesktop =
		typeof window !== "undefined" &&
		window.electronAPI?.platform === "win32" &&
		typeof window.electronAPI.getDefenderExclusionStatus === "function";
	let defenderExcluded = false;
	let defenderBusy = false;
	let defenderError = "";
	let defenderPaths: string[] = [];
	const HOME_REFRESH_EVENT = "raffi:home-refresh";

	const refreshDefenderStatus = async () => {
		if (!isWindowsDesktop) return;
		const api = window.electronAPI;
		if (!api?.getDefenderExclusionStatus) return;
		try {
			const status = await api.getDefenderExclusionStatus();
			defenderExcluded = Boolean(status?.excluded);
			defenderPaths = Array.isArray(status?.paths) ? status.paths : [];
			// Only surface read errors when exclusions are not already active.
			defenderError = status?.excluded ? "" : status?.error || "";
		} catch (error) {
			if (!defenderExcluded) {
				defenderError =
					error instanceof Error ? error.message : "Could not read Defender status";
			}
		}
	};

	onMount(() => {
		const storedRpc = localStorage.getItem("discord_rpc_enabled");
		discordRpcEnabled = storedRpc !== null ? storedRpc === "true" : true;
		const storedSeek = localStorage.getItem("seek_bar_style");
		seekBarStyle = storedSeek || "raffi";
		miniPlayerEnabled = $miniPlayerOnMinimize;
		heroSource = getStoredHomeHeroSource();
		searchBarPosition = getStoredHomeSearchBarPosition();
		void loadTraktHeroSourceAvailability();
		void loadHeroSourceOptions();
		if (isWindowsDesktop) {
			void refreshDefenderStatus();
		}
	});

	const emitHomeRefresh = () => {
		window.dispatchEvent(new CustomEvent(HOME_REFRESH_EVENT));
	};

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

	function toggleAutoSkipIntros() {
		autoSkipIntros.update((value) => {
			const nextValue = !value;
			trackEvent("auto_skip_intros_toggled", { enabled: nextValue });
			return nextValue;
		});
	}

	function toggleMiniPlayer() {
		miniPlayerOnMinimize.update((value) => {
			const nextValue = !value;
			miniPlayerEnabled = nextValue;
			trackEvent("mini_player_on_minimize_toggled", { enabled: nextValue });
			return nextValue;
		});
	}

	async function toggleTorrenting() {
		if (torrentingSaving) return;
		torrentingSaving = true;
		torrentingError = "";
		const enabled = !$allowTorrenting;
		try {
			await setTorrentingAllowed(enabled);
			trackEvent("torrenting_toggled", { enabled });
		} catch (error) {
			console.error("Failed to update torrenting setting", error);
			torrentingError = "Could not update the playback server. Please try again.";
		} finally {
			torrentingSaving = false;
		}
	}

	async function applyDefenderExclusions() {
		if (!isWindowsDesktop) return;
		const api = window.electronAPI;
		if (!api?.applyDefenderExclusions || defenderBusy) return;

		const confirmed = api.showConfirmDialog
			? await api.showConfirmDialog(
					"Raffi will ask Windows for Administrator permission to exclude its temp folders and playback tools from Microsoft Defender real-time scanning. This is optional and only affects Raffi's working directories.",
					"Exclude Raffi from Defender?",
				)
			: window.confirm(
					"Exclude Raffi temp folders from Microsoft Defender? Windows will ask for Administrator permission.",
				);
		if (!confirmed) return;

		defenderBusy = true;
		defenderError = "";
		try {
			const result = await api.applyDefenderExclusions();
			if (Array.isArray(result?.paths) && result.paths.length > 0) {
				defenderPaths = result.paths;
			}

			if (result?.ok) {
				defenderExcluded = true;
				defenderError = "";
				trackEvent("defender_exclusion_applied");
				// Re-read prefs so the UI matches Defender, but never undo a successful apply.
				await new Promise((resolve) => setTimeout(resolve, 500));
				try {
					const status = await api.getDefenderExclusionStatus?.();
					if (status?.excluded) {
						defenderExcluded = true;
					}
					if (Array.isArray(status?.paths) && status.paths.length > 0) {
						defenderPaths = status.paths;
					}
				} catch {
					// keep applied state
				}
			} else {
				defenderExcluded = false;
				defenderError =
					result?.error ||
					"Exclusion failed. You may have cancelled the Administrator prompt.";
				trackEvent("defender_exclusion_failed");
			}
		} catch (error) {
			defenderExcluded = false;
			defenderError =
				error instanceof Error ? error.message : "Could not apply Defender exclusions";
			trackEvent("defender_exclusion_failed");
		} finally {
			defenderBusy = false;
		}
	}

	async function loadHeroSourceOptions() {
		heroSourceLoading = true;
		try {
			const addons = await getAddons();
			heroSourceOptions = getHeroCatalogSourceOptions(addons);
			const isAddonSource = heroSourceOptions.some((option) => option.id === heroSource);
			const isValidBuiltin =
				heroSource === HOME_HERO_SOURCE_CINEMETA ||
				(heroSource === HOME_HERO_SOURCE_TRAKT_RECOMMENDATIONS && traktHeroSourceAvailable);
			if (
				!isValidBuiltin &&
				!isAddonSource
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

	async function loadTraktHeroSourceAvailability() {
		if ($localMode || !$currentUser) {
			traktHeroSourceAvailable = false;
			if (heroSource === HOME_HERO_SOURCE_TRAKT_RECOMMENDATIONS) {
				heroSource = HOME_HERO_SOURCE_CINEMETA;
				setStoredHomeHeroSource(HOME_HERO_SOURCE_CINEMETA);
				emitHomeRefresh();
			}
			return;
		}

		try {
			const status = await getTraktStatus();
			traktHeroSourceAvailable = Boolean(status.connected && status.configured);
		} catch {
			traktHeroSourceAvailable = false;
		}

		if (!traktHeroSourceAvailable && heroSource === HOME_HERO_SOURCE_TRAKT_RECOMMENDATIONS) {
			heroSource = HOME_HERO_SOURCE_CINEMETA;
			setStoredHomeHeroSource(HOME_HERO_SOURCE_CINEMETA);
			emitHomeRefresh();
		}
	}

	function setHeroSource(sourceId: string) {
		const next = sourceId && sourceId.length > 0 ? sourceId : HOME_HERO_SOURCE_CINEMETA;
		if (next === heroSource) return;
		heroSource = next;
		setStoredHomeHeroSource(next);
		emitHomeRefresh();
		trackEvent("home_hero_source_changed", {
			source:
				next === HOME_HERO_SOURCE_CINEMETA
					? "cinemeta"
					: next === HOME_HERO_SOURCE_TRAKT_RECOMMENDATIONS
						? "trakt_recommendations"
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
</script>

<section class="rounded-[28px] bg-white/4 p-6 flex flex-col gap-5">
	<div>
		<h3 class="text-white text-xl font-semibold">
			Preferences
		</h3>
		<p class="text-white/60 text-sm">
			Control connected experiences and integrations.
		</p>
	</div>
	<div class="rounded-2xl bg-white/8 p-4 flex flex-wrap items-center gap-4 justify-between">
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
				class={`absolute top-1 left-1 w-7 h-7 rounded-full text-[10px] font-semibold flex items-center justify-center transition-all duration-200 ${
					discordRpcEnabled
						? "translate-x-7 bg-black text-white/90"
						: "translate-x-0 bg-white/80 text-black"
				}`}
			>
				{discordRpcEnabled ? "On" : "Off"}
			</span>
		</button>
	</div>

	<div class="rounded-2xl bg-white/8 p-4 flex flex-wrap items-center gap-4 justify-between">
		<div>
			<p class="text-white font-medium">
				Seek Bar Style
			</p>
			<p class="text-white/60 text-sm">
				Choose between Raffi (inverted) or Standard style.
			</p>
		</div>
		<button
			class="relative h-9 w-40 rounded-full border border-white/10 transition-colors duration-200 cursor-pointer bg-white/10 p-1"
			on:click={toggleSeekBar}
			aria-label="Toggle Seek Bar Style"
		>
			<div class="relative z-10 flex w-full h-full items-center">
				<span class={`flex-1 text-center text-xs font-semibold transition-colors duration-200 ${seekBarStyle === 'raffi' ? 'text-black' : 'text-white/60'}`}>Raffi</span>
				<span class={`flex-1 text-center text-xs font-semibold transition-colors duration-200 ${seekBarStyle === 'normal' ? 'text-black' : 'text-white/60'}`}>Normal</span>
			</div>
			<div
				class={`absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] bg-white rounded-full transition-transform duration-200 ${seekBarStyle === 'normal' ? 'translate-x-full' : 'translate-x-0'}`}
			></div>
		</button>
	</div>

	<div class="rounded-2xl bg-white/8 p-4 flex flex-wrap items-center gap-4 justify-between">
		<div>
			<p class="text-white font-medium">
				Mini Player on Minimize
			</p>
			<p class="text-white/60 text-sm">
				Keep playback visible in a floating always-on-top window while Raffi is minimized.
			</p>
		</div>
		<button
			class={`relative w-16 h-9 rounded-full border border-white/10 transition-colors duration-200 cursor-pointer ${
				miniPlayerEnabled ? "bg-white" : "bg-white/10"
			}`}
			on:click={toggleMiniPlayer}
			aria-label="Toggle mini player on minimize"
			role="switch"
			aria-checked={miniPlayerEnabled}
		>
			<span
				class={`absolute top-1 left-1 w-7 h-7 rounded-full text-[10px] font-semibold flex items-center justify-center transition-all duration-200 ${
					miniPlayerEnabled
						? "translate-x-7 bg-black text-white/90"
						: "translate-x-0 bg-white/80 text-black"
				}`}
			>
				{miniPlayerEnabled ? "On" : "Off"}
			</span>
		</button>
	</div>

	<div class="rounded-2xl bg-white/8 p-4 flex flex-wrap items-center gap-4 justify-between">
		<div>
			<p class="text-white font-medium">Allow Torrenting</p>
			<p class="text-white/60 text-sm">
				Allow Raffi to start, download, and seed torrent streams. Turning this off stops all torrent activity.
			</p>
			{#if torrentingError}
				<p class="mt-1 text-red-300 text-xs">{torrentingError}</p>
			{/if}
		</div>
		<button
			class={`relative w-16 h-9 rounded-full border border-white/10 transition-colors duration-200 cursor-pointer disabled:cursor-wait disabled:opacity-60 ${
				$allowTorrenting ? "bg-white" : "bg-white/10"
			}`}
			on:click={toggleTorrenting}
			disabled={torrentingSaving}
			aria-label="Toggle torrenting"
			role="switch"
			aria-checked={$allowTorrenting}
		>
			<span
				class={`absolute top-1 left-1 w-7 h-7 rounded-full text-[10px] font-semibold flex items-center justify-center transition-all duration-200 ${
					$allowTorrenting
						? "translate-x-7 bg-black text-white/90"
						: "translate-x-0 bg-white/80 text-black"
				}`}
			>
				{$allowTorrenting ? "On" : "Off"}
			</span>
		</button>
	</div>

	{#if isWindowsDesktop}
		<div class="rounded-2xl bg-white/8 p-4 flex flex-col gap-4">
			<div class="flex flex-wrap items-start gap-4 justify-between">
				<div class="min-w-0 flex-1">
					<p class="text-white font-medium">
						Exclude Raffi from Microsoft Defender
					</p>
					<p class="text-white/60 text-sm">
						Stops Defender from scanning Raffi's temp folders while you watch.
					</p>
					{#if defenderExcluded}
						<p class="mt-2 text-emerald-300/90 text-xs">
							Exclusions are active.
						</p>
					{:else if defenderError}
						<p class="mt-2 text-red-300 text-xs">{defenderError}</p>
					{/if}
				</div>
				<button
					class="rounded-full bg-white text-black px-4 py-2 text-sm font-semibold cursor-pointer disabled:cursor-wait disabled:opacity-60"
					on:click={applyDefenderExclusions}
					disabled={defenderBusy || defenderExcluded}
				>
					{defenderBusy
						? "Waiting…"
						: defenderExcluded
							? "Excluded"
							: "Exclude folders"}
				</button>
			</div>
			{#if defenderPaths.length > 0}
				<details class="text-white/50 text-xs">
					<summary class="cursor-pointer select-none">Folders Raffi will exclude</summary>
					<ul class="mt-2 space-y-1 break-all">
						{#each defenderPaths as folderPath}
							<li>{folderPath}</li>
						{/each}
					</ul>
				</details>
			{/if}
		</div>
	{/if}

	<div class="rounded-2xl bg-white/8 p-4 flex flex-wrap items-center gap-4 justify-between">
		<div>
			<p class="text-white font-medium">
				Auto-skip Intros
			</p>
			<p class="text-white/60 text-sm">
				Skip intro chapters automatically, and chain from next-episode recap skips when applicable.
			</p>
		</div>
		<button
			class={`relative w-16 h-9 rounded-full border border-white/10 transition-colors duration-200 cursor-pointer ${
				$autoSkipIntros ? "bg-white" : "bg-white/10"
			}`}
			on:click={toggleAutoSkipIntros}
			aria-label="Toggle automatic intro skipping"
			role="switch"
			aria-checked={$autoSkipIntros}
		>
			<span
				class={`absolute top-1 left-1 w-7 h-7 rounded-full text-[10px] font-semibold flex items-center justify-center transition-all duration-200 ${
					$autoSkipIntros
						? "translate-x-7 bg-black text-white/90"
						: "translate-x-0 bg-white/80 text-black"
				}`}
			>
				{$autoSkipIntros ? "On" : "Off"}
			</span>
		</button>
	</div>

	<DirectSourceSection />

	<UiScaleControl />

	<div class="grid items-stretch gap-4 xl:grid-cols-2">
		<SearchBarPositionCard {searchBarPosition} onChange={setSearchBarPosition} />
		<HeroSourceCard
			{heroSource}
			{heroSourceLoading}
			{heroSourceOptions}
			showTraktRecommendationsOption={traktHeroSourceAvailable}
			onChange={setHeroSource}
		/>
	</div>
</section>
