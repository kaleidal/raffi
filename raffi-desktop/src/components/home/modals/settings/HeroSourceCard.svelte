<script lang="ts">
	import { ChevronDown } from "lucide-svelte";
	import type { HeroCatalogSourceOption } from "../../../../lib/library/addonCatalogs";
	import { HOME_HERO_SOURCE_CINEMETA } from "../../../../lib/home/heroSettings";

	export let heroSource = HOME_HERO_SOURCE_CINEMETA;
	export let heroSourceLoading = false;
	export let heroSourceOptions: HeroCatalogSourceOption[] = [];
	export let onChange: (value: string) => void = () => {};

	function handleChange(event: Event) {
		onChange((event.currentTarget as HTMLSelectElement).value);
	}
</script>

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
				on:change={handleChange}
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
