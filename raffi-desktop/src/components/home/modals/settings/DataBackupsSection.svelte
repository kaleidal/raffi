<script lang="ts">
	export let onDownloadData: () => void = () => {};
</script>

<section class="rounded-[28px] bg-white/[0.04] p-6 flex flex-col gap-5">
	<div>
		<h3 class="text-white text-xl font-semibold">
			Data & Backups
		</h3>
		<p class="text-white/60 text-sm">
			Grab everything in one tidy JSON export.
		</p>
	</div>
	<div class="rounded-2xl bg-white/[0.08] p-5 flex flex-col gap-4">
		<div>
			<p class="text-white font-medium">
				Export library + lists
			</p>
			<p class="text-white/60 text-sm">
				Includes history, lists, and metadata.
			</p>
		</div>
		<button
			class="self-start bg-white text-black px-6 py-3 rounded-2xl font-semibold hover:bg-white/90 transition-colors cursor-pointer"
			on:click={onDownloadData}
		>
			Download JSON
		</button>
	</div>
</section>
