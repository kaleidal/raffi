<script lang="ts">
	import { liveLayout, showLiveInHeader, type LiveLayout } from "../../../../lib/live/preferences";

	const layouts: Array<[LiveLayout, string]> = [
		["auto", "Auto"],
		["guide", "Guide"],
		["grid", "Grid"],
	];

	$: layoutIndex = layouts.findIndex(([value]) => value === $liveLayout);
</script>

<section class="rounded-[28px] bg-white/4 p-6 flex flex-col gap-5">
	<h3 class="text-white text-xl font-semibold">Live TV</h3>

	<div class="rounded-2xl bg-white/8 p-4 flex flex-wrap items-center gap-4 justify-between">
		<div>
			<p class="text-white font-medium">Show in Header</p>
			<p class="text-white/60 text-sm">Add a Live TV button next to your lists.</p>
		</div>
		<button
			class={`relative w-16 h-9 rounded-full border border-white/10 transition-colors duration-200 cursor-pointer ${
				$showLiveInHeader ? "bg-white" : "bg-white/10"
			}`}
			on:click={() => showLiveInHeader.update((value) => !value)}
			aria-label="Toggle Live TV in the header"
			role="switch"
			aria-checked={$showLiveInHeader}
		>
			<span
				class={`absolute top-1 left-1 w-7 h-7 rounded-full text-[10px] font-semibold flex items-center justify-center transition-all duration-200 ${
					$showLiveInHeader ? "translate-x-7 bg-black text-white/90" : "translate-x-0 bg-white/80 text-black"
				}`}
			>
				{$showLiveInHeader ? "On" : "Off"}
			</span>
		</button>
	</div>

	<div class="rounded-2xl bg-white/8 p-4 flex flex-wrap items-center gap-4 justify-between">
		<div>
			<p class="text-white font-medium">Channel Layout</p>
			<p class="text-white/60 text-sm">Auto shows the guide when your source has one.</p>
		</div>
		<div class="relative h-9 w-52 rounded-full border border-white/10 bg-white/10 p-1">
			<div
				class="absolute top-1 bottom-1 left-1 w-[calc((100%-8px)/3)] rounded-full bg-white transition-transform duration-200"
				style="transform:translateX({layoutIndex * 100}%)"
			></div>
			<div class="relative z-10 flex h-full w-full items-center">
				{#each layouts as [value, label] (value)}
					<button
						class={`flex-1 h-full text-center text-xs font-semibold transition-colors duration-200 cursor-pointer ${
							$liveLayout === value ? "text-black" : "text-white/60 hover:text-white"
						}`}
						on:click={() => liveLayout.set(value)}
					>
						{label}
					</button>
				{/each}
			</div>
		</div>
	</div>
</section>
