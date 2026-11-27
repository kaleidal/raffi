<script lang="ts">
	import { onMount } from "svelte";
	import { Monitor } from "@lucide/svelte";
	import Button from "../../common/controls/Button.svelte";
	import CodeInput from "../../common/controls/CodeInput.svelte";
	import Dialog from "../../common/dialog/Dialog.svelte";
	import ShapeLoader from "../../common/loading/ShapeLoader.svelte";
	import {
		discoverLimbo,
		limboAddressToBaseUrl,
		pairLimbo,
		type DiscoveredLimbo,
		type LimboPairing,
	} from "../../../lib/streams/limboLan";

	let {
		onPaired,
		onClose,
	}: {
		onPaired: (pairing: LimboPairing) => void;
		onClose: () => void;
	} = $props();

	type Target = { name: string; baseUrl: string };

	let step = $state<"searching" | "pick" | "address" | "code">("searching");
	let found = $state.raw<DiscoveredLimbo[]>([]);
	let target = $state.raw<Target | null>(null);
	let address = $state("");
	let code = $state("");
	let busy = $state(false);
	let error = $state("");

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

<Dialog title="Pair with Limbo" {onClose} class="max-w-lg">
	<p class="-mt-3 text-ink/60">
		{#if step === "code" && target}
			In Limbo on {target.name}, open Settings, choose Pair under Torrents, and enter the code it shows.
		{:else}
			Raffi plays torrents through Limbo on a computer on the same network.
		{/if}
	</p>

	{#if step === "searching"}
		<div class="flex items-center gap-3 text-ink/70">
			<ShapeLoader size="24px" />
			Looking for Limbo on your network…
		</div>
	{:else if step === "pick"}
		{#if found.length === 0}
			<p class="text-sm text-ink/60">
				No Limbo found. Open Limbo on your computer and turn on Devices on your network under Settings → Torrents.
			</p>
		{/if}
		<div class="-mx-2 flex flex-col gap-0.5">
			{#each found as service (service.id)}
				<button
					class="flex cursor-pointer items-center gap-3 rounded-[16px] px-4 py-3 text-left transition-colors hover:bg-ink/8 focus:bg-ink/8"
					onclick={() => choose(service)}
				>
					<Monitor size={20} strokeWidth={2} class="shrink-0 text-ink/70" />
					<span class="truncate font-medium">{service.name}</span>
				</button>
			{/each}
		</div>
		<div class="flex flex-wrap justify-end gap-2">
			<Button
				onclick={() => {
					error = "";
					step = "address";
				}}
			>
				Enter an address
			</Button>
			<Button variant="primary" onclick={search}>Search again</Button>
		</div>
	{:else if step === "address"}
		<form class="flex flex-col gap-3" onsubmit={(event) => (event.preventDefault(), useAddress())}>
			<input
				type="text"
				inputmode="decimal"
				bind:value={address}
				placeholder="192.168.1.20"
				aria-label="Computer address"
				class="min-h-12 rounded-full bg-ink/8 px-5 outline-none placeholder:text-ink/30 focus:bg-ink/12"
			/>
			<Button type="submit" variant="primary" class="self-end" disabled={!address.trim()}>Continue</Button>
		</form>
	{:else}
		<form class="flex flex-col gap-4" onsubmit={(event) => (event.preventDefault(), pair())}>
			<CodeInput bind:value={code} disabled={busy} label="Pairing code" onComplete={() => void pair()} />
			<Button type="submit" variant="primary" class="self-end" disabled={busy || code.length < 6}>
				{busy ? "Pairing…" : "Pair"}
			</Button>
		</form>
	{/if}

	{#if error}
		<p class="text-sm text-danger">{error}</p>
	{/if}
</Dialog>
