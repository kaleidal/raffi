<script lang="ts">
	import { onMount } from "svelte";
	import UiScaleControl from "./UiScaleControl.svelte";
	import SearchBarPositionCard from "./SearchBarPositionCard.svelte";
	import HeroSourceCard from "./HeroSourceCard.svelte";
	import { enableRPC, disableRPC } from "../../../../lib/rpc";
	import { getAddons } from "../../../../lib/db/db";
	import { trackEvent } from "../../../../lib/analytics";
	import {
		getHeroCatalogSourceOptions,
		type HeroCatalogSourceOption,
	} from "../../../../lib/library/addonCatalogs";
	import {
		HOME_HERO_SOURCE_CINEMETA,
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
	let searchBarPosition: HomeSearchBarPosition = HOME_SEARCH_BAR_POSITION_AUTO;
	let heroSource = HOME_HERO_SOURCE_CINEMETA;
	let heroSourceOptions: HeroCatalogSourceOption[] = [];
	let heroSourceLoading = false;
	const HOME_REFRESH_EVENT = "raffi:home-refresh";

	onMount(() => {
		const storedRpc = localStorage.getItem("discord_rpc_enabled");
		discordRpcEnabled = storedRpc !== null ? storedRpc === "true" : true;
		const storedSeek = localStorage.getItem("seek_bar_style");
		seekBarStyle = storedSeek || "raffi";
		heroSource = getStoredHomeHeroSource();
		searchBarPosition = getStoredHomeSearchBarPosition();
		void loadHeroSourceOptions();
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
		const next = sourceId && sourceId.length > 0 ? sourceId : HOME_HERO_SOURCE_CINEMETA;
		if (next === heroSource) return;
		heroSource = next;
		setStoredHomeHeroSource(next);
		emitHomeRefresh();
		trackEvent("home_hero_source_changed", {
			source: next === HOME_HERO_SOURCE_CINEMETA ? "cinemeta" : "addon_catalog",
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

	<UiScaleControl />

	<div class="grid items-stretch gap-4 xl:grid-cols-2">
		<SearchBarPositionCard {searchBarPosition} onChange={setSearchBarPosition} />
		<HeroSourceCard
			{heroSource}
			{heroSourceLoading}
			{heroSourceOptions}
			onChange={setHeroSource}
		/>
	</div>
</section>
