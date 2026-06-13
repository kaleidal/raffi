<script lang="ts">
	import { onMount } from 'svelte';
	import '@raffi/app/app.css';

	let AppComponent = $state<import('svelte').Component | null>(null);
	let mounted = $state(false);

	onMount(async () => {
		const mod = await import('@raffi/app');
		AppComponent = mod.App;
		mounted = true;
	});
</script>

<svelte:head>
	<title>Raffi • Web</title>
	<meta name="description" content="Raffi in the browser — optimized for direct debrid and HTTP streams." />
</svelte:head>

{#if mounted}
	<div class="web-shell">
		{#if AppComponent}
			<AppComponent />
		{:else}
			<div class="loading-screen">
				<div class="spinner"></div>
			</div>
		{/if}
	</div>
{:else}
	<div class="loading-screen">
		<div class="spinner"></div>
	</div>
{/if}

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
		background: #090909;
	}

	.loading-screen {
		height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #0a0a0a;
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid #333;
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
