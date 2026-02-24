<script lang="ts">
	export let onRecoverToLocalMode: () => void = () => {};
</script>

<section class="rounded-[28px] bg-white/[0.04] p-6 flex flex-col gap-4">
	<h3 class="text-white text-xl font-semibold">Account state mismatch</h3>
	<p class="text-white/60 text-sm">
		Raffi is in synced mode but no valid Ave session is available.
	</p>
	<button
		class="self-start bg-white text-black px-5 py-2 rounded-2xl font-semibold hover:bg-white/90 transition-colors cursor-pointer"
		on:click={onRecoverToLocalMode}
	>
		Switch to local mode
	</button>
</section>
