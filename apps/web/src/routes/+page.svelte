<script lang="ts">
	import { onMount } from 'svelte';
	import '@raffi/app/app.css';
	import ShapeLoader from '@raffi/app/components/common/loading/ShapeLoader.svelte';

	let AppComponent = $state<import('svelte').Component | null>(null);

	onMount(async () => {
		AppComponent = (await import('@raffi/app')).App;
	});
</script>

<svelte:head>
	<title>Raffi • Web</title>
	<meta name="description" content="Raffi in the browser — optimized for direct debrid and HTTP streams." />
</svelte:head>

<div class="web-shell">
	{#if AppComponent}
		<AppComponent />
	{:else}
		<div class="loading-screen">
			<ShapeLoader size="40px" />
		</div>
	{/if}
</div>

<style>
	:global(html),
	:global(body) {
		margin: 0;
		padding: 0;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	.web-shell {
		width: 100vw;
		height: 100vh;
		overflow: hidden;
		background: var(--raffi-canvas);
	}

	.loading-screen {
		height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--raffi-ink);
	}
</style>
