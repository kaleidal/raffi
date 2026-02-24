<script lang="ts">
	export let aveLoading = false;
	export let onAveLogin: () => void = () => {};
</script>

<section class="rounded-[28px] bg-white/[0.04] p-6 flex flex-col gap-5">
	<div>
		<h3 class="text-white text-xl font-semibold">Sign In With Ave</h3>
		<p class="text-white/60 text-sm">
			Use your Ave account to sync your library and lists across devices.
		</p>
	</div>
	<div class="rounded-2xl bg-white/[0.08] p-5 space-y-4">
		<button
			class="w-full bg-white text-black px-6 py-3 rounded-2xl font-semibold hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
			on:click={onAveLogin}
			disabled={aveLoading}
		>
			{aveLoading ? "Opening browser..." : "Continue with Ave"}
		</button>
	</div>
</section>
