<script lang="ts">
	import { X } from "@lucide/svelte";
	import type { Component } from "svelte";
	import Dialog from "../common/dialog/Dialog.svelte";
	import AboutSettings from "./about/AboutSettings.svelte";
	import AccountSettings from "./account/AccountSettings.svelte";
	import AddonsSettings from "./addons/AddonsSettings.svelte";
	import AppearanceSettings from "./appearance/AppearanceSettings.svelte";
	import LibrarySettings from "./library/LibrarySettings.svelte";
	import LiveTvSettings from "./live/LiveTvSettings.svelte";
	import PlaybackSettings from "./playback/PlaybackSettings.svelte";
	import StreamingSettings from "./streaming/StreamingSettings.svelte";
	import { SECTIONS } from "./sections";
	import { closeSettings, settingsView, type SettingsSection } from "../../lib/stores/settings";

	const sections = SECTIONS.filter((section) => section.id !== "library" || window.electronAPI?.localLibrary);

	const pages: Record<Exclude<SettingsSection, "addons">, Component> = {
		account: AccountSettings,
		appearance: AppearanceSettings,
		playback: PlaybackSettings,
		streaming: StreamingSettings,
		live: LiveTvSettings,
		library: LibrarySettings,
		about: AboutSettings,
	};

	let content = $state<HTMLDivElement | null>(null);

	const current = $derived(sections.find((section) => section.id === $settingsView?.section) ?? sections[0]);

	function select(section: SettingsSection) {
		if (!$settingsView) return;
		settingsView.set({ ...$settingsView, section });
		content?.scrollTo({ top: 0 });
	}
</script>

{#if $settingsView}
	<Dialog
		bare
		onClose={closeSettings}
		class="max-h-[min(900px,100%)] min-h-[min(560px,100%)] max-w-[1080px] flex-row! bg-raised/70 backdrop-blur-[40px] portrait:flex-col!"
	>
		<nav
			class="no-scrollbar flex w-64 shrink-0 flex-col gap-1 overflow-y-auto p-5 portrait:w-full portrait:flex-row portrait:overflow-x-auto portrait:pb-0"
		>
			<h2 class="px-4 pt-2 pb-5 text-[1.75rem] font-semibold text-ink portrait:hidden">Settings</h2>
			{#each sections as section (section.id)}
				<button
					class="flex shrink-0 cursor-pointer items-center gap-3 rounded-full px-4 py-2.5 text-left font-medium transition-colors {section.id === current.id
						? 'bg-ink/12 text-ink'
						: 'text-ink/60 hover:bg-ink/6 hover:text-ink'}"
					aria-current={section.id === current.id ? "page" : undefined}
					onclick={() => select(section.id)}
				>
					<section.icon size={18} strokeWidth={2} />
					{section.label}
				</button>
			{/each}
		</nav>

		<div bind:this={content} class="min-h-0 flex-1 overflow-y-auto px-10 pt-7 pb-12 portrait:px-6">
			<div class="flex items-center justify-between gap-4 pb-4">
				<h2 class="text-3xl font-semibold text-ink">{current.label}</h2>
				<button
					class="-mr-2 cursor-pointer rounded-full p-2 text-ink/50 transition-colors hover:bg-ink/8 hover:text-ink"
					onclick={closeSettings}
					aria-label="Close settings"
				>
					<X size={24} strokeWidth={2} />
				</button>
			</div>
			<div class="max-w-[760px]">
				{#if current.id === "addons"}
					<AddonsSettings filter={$settingsView.addonFilter} />
				{:else}
					{@const Page = pages[current.id]}
					<Page />
				{/if}
			</div>
		</div>
	</Dialog>
{/if}
