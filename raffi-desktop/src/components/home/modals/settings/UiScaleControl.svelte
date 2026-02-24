<script lang="ts">
	import { userZoom } from "../../../../lib/stores/settingsStore";
</script>

<div class="rounded-2xl bg-white/[0.08] p-4 flex flex-wrap items-center gap-4 justify-between">
	<div>
		<p class="text-white font-medium">
			UI Scale
		</p>
		<p class="text-white/60 text-sm">
			Adjust the size of the interface.
		</p>
	</div>
	<div class="flex items-center gap-3">
		<button
			class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
			on:click={() => userZoom.update((z) => Math.max(z - 0.1, 0.5))}
		>
			-
		</button>
		<span class="text-white font-medium w-12 text-center">{Math.round($userZoom * 100)}%</span>
		<button
			class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
			on:click={() => userZoom.update((z) => Math.min(z + 0.1, 2.0))}
		>
			+
		</button>
		<button
			class="ml-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 text-xs transition-colors"
			on:click={() => userZoom.set(1.0)}
		>
			Reset
		</button>
	</div>
</div>
