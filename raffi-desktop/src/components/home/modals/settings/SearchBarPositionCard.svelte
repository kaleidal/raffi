<script lang="ts">
	import { ChevronDown } from "lucide-svelte";
	import {
		HOME_SEARCH_BAR_POSITION_AUTO,
		HOME_SEARCH_BAR_POSITION_BOTTOM,
		HOME_SEARCH_BAR_POSITION_HEADER,
		type HomeSearchBarPosition,
	} from "../../../../lib/home/searchBarSettings";

	export let searchBarPosition: HomeSearchBarPosition = HOME_SEARCH_BAR_POSITION_AUTO;
	export let onChange: (value: string) => void = () => {};

	function handleChange(event: Event) {
		onChange((event.currentTarget as HTMLSelectElement).value);
	}
</script>

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
				on:change={handleChange}
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
