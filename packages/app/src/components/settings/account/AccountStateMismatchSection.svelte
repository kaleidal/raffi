<script lang="ts">
	export let onRecoverToLocalMode: () => void = () => {};
</script>

<section class="flex flex-col gap-4">
	<p class="text-ink/60">
		Your sign-in has expired.
	</p>
	<button
		class="self-start bg-accent text-on-accent px-5 py-2.5 rounded-full font-semibold hover:bg-accent/85 transition-colors cursor-pointer"
		on:click={onRecoverToLocalMode}
	>
		Switch to local mode
	</button>
</section>
