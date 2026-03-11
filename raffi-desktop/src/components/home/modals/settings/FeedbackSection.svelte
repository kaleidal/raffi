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
			on:click={() => openExternalLink("https://github.com/kaleidal/raffi/issues")}
			class="rounded-2xl bg-white/[0.08] p-4 text-white font-medium hover:bg-white/[0.14] transition-colors cursor-pointer text-left"
		>
			Report an issue
			<span class="block text-white/50 text-sm mt-1">Open the issue tracker</span>
		</button>
		<button
			type="button"
			on:click={() => openExternalLink("https://github.com/kaleidal/raffi/discussions")}
			class="rounded-2xl bg-white/[0.08] p-4 text-white font-medium hover:bg-white/[0.14] transition-colors cursor-pointer text-left"
		>
			Start a discussion
			<span class="block text-white/50 text-sm mt-1">Open the discussions</span>
		</button>
	</div>
</section>
