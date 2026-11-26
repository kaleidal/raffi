<script lang="ts">
	import { secondaryButton } from "../buttons";
	import { onMount } from "svelte";
	import CustomSelect from "../../common/controls/CustomSelect.svelte";
	import Segmented from "../../common/controls/Segmented.svelte";
	import SettingRow from "../SettingRow.svelte";
	import { themePreference, type ThemePreference } from "../../../lib/appearance/theme";
	import { openThemesFolder, supportsCustomThemes } from "../../../lib/appearance/customThemes";
	import { isTvPlatform } from "../../../lib/shell/platform";
	import { getAddons, getTraktStatus } from "../../../lib/db/db";
	import { currentUser, localMode } from "../../../lib/stores/authStore";
	import { getHeroCatalogSourceOptions, type HeroCatalogSourceOption } from "../../../lib/library/addonCatalogs";
	import {
		HOME_HERO_SOURCE_CINEMETA,
		HOME_HERO_SOURCE_TRAKT_RECOMMENDATIONS,
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

	const HOME_REFRESH_EVENT = "raffi:home-refresh";

	const themes: ReadonlyArray<{ value: ThemePreference; label: string }> = [
		{ value: "dark", label: "Dark" },
		{ value: "light", label: "Light" },
		{ value: "system", label: "System" },
	];

	const searchBarPositions: ReadonlyArray<{ value: HomeSearchBarPosition; label: string }> = [
		{ value: HOME_SEARCH_BAR_POSITION_AUTO, label: "Auto" },
		{ value: HOME_SEARCH_BAR_POSITION_HEADER, label: "Top" },
		{ value: HOME_SEARCH_BAR_POSITION_BOTTOM, label: "Bottom" },
	];

	let searchBarPosition = $state<HomeSearchBarPosition>(getStoredHomeSearchBarPosition());
	let heroSource = $state(getStoredHomeHeroSource());
	let heroCatalogs = $state.raw<HeroCatalogSourceOption[]>([]);
	let traktAvailable = $state(false);

	const heroOptions = $derived([
		{ value: HOME_HERO_SOURCE_CINEMETA, label: "Cinemeta" },
		...(traktAvailable ? [{ value: HOME_HERO_SOURCE_TRAKT_RECOMMENDATIONS, label: "Trakt recommendations" }] : []),
		...heroCatalogs.map((option) => ({ value: option.id, label: option.label })),
	]);

	onMount(async () => {
		const [addons, trakt] = await Promise.all([
			getAddons(),
			$localMode || !$currentUser ? null : getTraktStatus().catch(() => null),
		]);
		heroCatalogs = getHeroCatalogSourceOptions(addons);
		traktAvailable = Boolean(trakt?.connected && trakt.configured);

		const available =
			heroSource === HOME_HERO_SOURCE_CINEMETA ||
			(heroSource === HOME_HERO_SOURCE_TRAKT_RECOMMENDATIONS && traktAvailable) ||
			heroCatalogs.some((option) => option.id === heroSource);
		if (!available) setHeroSource(HOME_HERO_SOURCE_CINEMETA);
	});

	function setHeroSource(next: string) {
		if (next === heroSource) return;
		heroSource = next;
		setStoredHomeHeroSource(next);
		window.dispatchEvent(new CustomEvent(HOME_REFRESH_EVENT));
	}

	function setSearchBarPosition(next: HomeSearchBarPosition) {
		if (next === searchBarPosition) return;
		searchBarPosition = next;
		setStoredHomeSearchBarPosition(next);
		window.dispatchEvent(new CustomEvent(HOME_SEARCH_BAR_POSITION_CHANGED_EVENT, { detail: { position: next } }));
	}

	const selectClass = "min-h-10 min-w-56 rounded-full bg-ink/10 px-4 text-sm text-ink hover:bg-ink/14";
</script>

<SettingRow title="Theme" description="Playback always stays dark.">
	<Segmented value={$themePreference} options={themes} label="Theme" onChange={(value) => themePreference.set(value)} />
</SettingRow>

{#if supportsCustomThemes}
	<SettingRow title="Custom themes" description="Stylesheets in this folder load on top of Raffi's look.">
		<button
			class={secondaryButton}
			onclick={openThemesFolder}
		>
			Open folder
		</button>
	</SettingRow>
{/if}

{#if !isTvPlatform}
	<SettingRow title="Search bar" description="Auto moves it to the bottom once you scroll.">
		<Segmented value={searchBarPosition} options={searchBarPositions} label="Search bar" onChange={setSearchBarPosition} />
	</SettingRow>
{/if}

<SettingRow title="Featured titles" description="Where the big title at the top of Home comes from.">
	<CustomSelect
		value={heroSource}
		options={heroOptions}
		buttonClass={selectClass}
		align="right"
		onChange={setHeroSource}
	/>
</SettingRow>
