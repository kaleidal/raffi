<script lang="ts">
	import { onMount } from "svelte";
	import { fade, scale } from "svelte/transition";
	import { Monitor } from "@lucide/svelte";
	import { portal } from "../../../../common/portal";
	import CodeInput from "../../../../common/CodeInput.svelte";
	import LoadingSpinner from "../../../../common/LoadingSpinner.svelte";
	import {
		discoverLimbo,
		limboAddressToBaseUrl,
		pairLimbo,
		type DiscoveredLimbo,
		type LimboPairing,
	} from "../../../../../lib/streams/limboLan";

	export let onPaired: (pairing: LimboPairing) => void;
	export let onClose: () => void;

	type Target = { name: string; baseUrl: string };

	let step: "searching" | "pick" | "address" | "code" = "searching";
	let found: DiscoveredLimbo[] = [];
	let target: Target | null = null;
	let address = "";
	let code = "";
	let busy = false;
	let error = "";

	async function search() {
		step = "searching";
		error = "";
		found = await discoverLimbo().catch(() => []);
		if (found.length === 1) choose(found[0]);
		else step = "pick";
	}

	function choose(next: Target) {
		target = next;
		code = "";
		error = "";
		step = "code";
	}

	function useAddress() {
		const baseUrl = limboAddressToBaseUrl(address);
		if (!baseUrl) {
			error = "Enter an address like 192.168.1.20.";
			return;
		}
		choose({ name: address.trim(), baseUrl });
	}

	async function pair() {
		if (!target || busy || code.length < 6) return;
		busy = true;
		error = "";
		try {
			onPaired(await pairLimbo(target.baseUrl, code));
		} catch (e) {
			error = e instanceof Error ? e.message : "Couldn't pair with Limbo.";
			code = "";
		} finally {
			busy = false;
		}
	}

	onMount(search);
</script>

<div
	use:portal
	class="fixed inset-0 z-300 flex items-center justify-center bg-[#101010]/60 backdrop-blur-xl"
	transition:fade={{ duration: 200 }}
	on:keydown={(e) => e.key === "Escape" && onClose()}
	role="dialog"
	aria-modal="true"
	aria-label="Pair with Limbo"
	tabindex="-1"
>
	<div
		class="flex w-full max-w-lg flex-col gap-6 rounded-[28px] bg-[#2b2b2b]/60 p-8 backdrop-blur-[40px] shadow-[0_40px_160px_rgba(0,0,0,0.45)]"
		transition:scale={{ duration: 200, start: 0.95 }}
	>
		<div class="flex flex-col gap-2">
			<h2 class="font-poppins text-2xl font-bold text-white">Pair with Limbo</h2>
			{#if step === "code" && target}
				<p class="text-white/60">
					In Limbo on {target.name}, open Settings, choose Pair under Torrents, and enter the code it shows.
				</p>
			{:else}
				<p class="text-white/60">
					Raffi plays torrents through Limbo on a computer on the same network.
				</p>
			{/if}
		</div>

		{#if step === "searching"}
			<div class="flex items-center gap-3 text-white/70">
				<LoadingSpinner size="24px" />
				Looking for Limbo on your network…
			</div>
		{:else if step === "pick"}
			{#if found.length === 0}
				<p class="text-sm text-white/60">
					No Limbo found. Open Limbo on your computer and turn on Devices on your network under Settings → Torrents.
				</p>
			{/if}
			<div class="flex flex-col gap-2">
				{#each found as service (service.id)}
					<button
						class="flex items-center gap-3 rounded-2xl bg-white/8 px-4 py-3 text-left text-white transition-colors hover:bg-white/14 focus:bg-white/14 cursor-pointer"
						on:click={() => choose(service)}
					>
						<Monitor size={20} strokeWidth={2} class="shrink-0 text-white/70" />
						<span class="truncate font-medium">{service.name}</span>
					</button>
				{/each}
			</div>
			<div class="flex gap-3">
				<button
					class="flex-1 rounded-2xl bg-white px-4 py-3 font-semibold text-black transition-colors hover:bg-white/90 cursor-pointer"
					on:click={search}
				>
					Search again
				</button>
				<button
					class="flex-1 rounded-2xl bg-white/10 px-4 py-3 font-semibold text-white transition-colors hover:bg-white/16 cursor-pointer"
					on:click={() => {
						error = "";
						step = "address";
					}}
				>
					Enter an address
				</button>
			</div>
		{:else if step === "address"}
			<form class="flex flex-col gap-3" on:submit|preventDefault={useAddress}>
				<input
					type="text"
					inputmode="decimal"
					bind:value={address}
					placeholder="192.168.1.20"
					aria-label="Computer address"
					class="min-h-12 rounded-2xl bg-white/8 px-4 text-white outline-none placeholder:text-white/30 focus:bg-white/12"
				/>
				<button
					type="submit"
					class="rounded-2xl bg-white px-4 py-3 font-semibold text-black transition-colors hover:bg-white/90 disabled:opacity-50 cursor-pointer"
					disabled={!address.trim()}
				>
					Continue
				</button>
			</form>
		{:else}
			<form class="flex flex-col gap-4" on:submit|preventDefault={pair}>
				<CodeInput
					bind:value={code}
					disabled={busy}
					label="Pairing code"
					on:complete={(event) => {
						code = event.detail.value;
						void pair();
					}}
				/>
				<button
					type="submit"
					class="rounded-2xl bg-white px-4 py-3 font-semibold text-black transition-colors hover:bg-white/90 disabled:opacity-50 cursor-pointer"
					disabled={busy || code.length < 6}
				>
					{busy ? "Pairing…" : "Pair"}
				</button>
			</form>
		{/if}

		{#if error}
			<div class="rounded-2xl bg-red-500/12 p-3 text-sm text-red-200">{error}</div>
		{/if}
	</div>
</div>
