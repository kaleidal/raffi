<script lang="ts">
	export let openExternalLink: (url: string) => void;
</script>

<section class="rounded-[28px] bg-white/[0.04] p-6 flex flex-col gap-5">
	<div>
		<h3 class="text-white text-xl font-semibold">Feedback</h3>
		<p class="text-white/60 text-sm">
			Share bugs or feature ideas to improve Raffi.
		</p>
	</div>
	<div class="grid gap-4 sm:grid-cols-2">
		<button
			type="button"
			on:click={() => openExternalLink("https://stator.sh/lantharos/raffi/bugs")}
			class="rounded-2xl bg-white/[0.08] p-4 text-white font-medium hover:bg-white/[0.14] transition-colors cursor-pointer text-left"
		>
			Report a bug
			<span class="block text-white/50 text-sm mt-1">Open the bug tracker</span>
		</button>
		<button
			type="button"
			on:click={() => openExternalLink("https://stator.sh/lantharos/raffi/feedback")}
			class="rounded-2xl bg-white/[0.08] p-4 text-white font-medium hover:bg-white/[0.14] transition-colors cursor-pointer text-left"
		>
			Request a feature
			<span class="block text-white/50 text-sm mt-1">Share your ideas</span>
		</button>
	</div>
</section>
