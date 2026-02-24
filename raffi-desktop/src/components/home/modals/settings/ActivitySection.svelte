<script lang="ts">
	export let moviesWatched = 0;
	export let showsWatched = 0;
</script>

<section class="rounded-[28px] bg-white/[0.04] p-6 flex flex-col gap-5">
	<div>
		<h3 class="text-white text-xl font-semibold">
			Activity
		</h3>
		<p class="text-white/60 text-sm">
			Track how much you've finished recently.
		</p>
	</div>
	<div class="grid gap-4 sm:grid-cols-2">
		<div class="rounded-2xl bg-white/[0.08] p-4">
			<p class="text-white/60 text-xs uppercase tracking-[0.3em]">
				Movies
			</p>
			<p class="text-white text-4xl font-bold">
				{moviesWatched}
			</p>
		</div>
		<div class="rounded-2xl bg-white/[0.08] p-4">
			<p class="text-white/60 text-xs uppercase tracking-[0.3em]">
				Shows
			</p>
			<p class="text-white text-4xl font-bold">
				{showsWatched}
			</p>
		</div>
	</div>
</section>
