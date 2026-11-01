<script lang="ts">
	import LimboPairingModal from "./LimboPairingModal.svelte";
	import { allowTorrenting, setTorrentingAllowed } from "../../../../../lib/stores/torrenting";
	import { forgetLimbo, limboPairing } from "../../../../../lib/streams/limboLan";

	let pairing = false;
	let saving = false;
	let error = "";

	async function enable() {
		saving = true;
		error = "";
		try {
			await setTorrentingAllowed(true);
		} catch (e) {
			error = e instanceof Error ? e.message : "Couldn't reach Limbo.";
		} finally {
			saving = false;
		}
	}

	function toggle() {
		if (saving) return;
		if ($allowTorrenting) allowTorrenting.set(false);
		else if ($limboPairing) void enable();
		else pairing = true;
	}

	function paired() {
		pairing = false;
		void enable();
	}

	async function unpair() {
		allowTorrenting.set(false);
		await forgetLimbo();
	}
</script>

<div class="rounded-2xl bg-white/8 p-4 flex flex-wrap items-center gap-4 justify-between">
	<div>
		<p class="text-white font-medium">Allow Torrenting</p>
		<p class="text-white/60 text-sm">
			{#if $limboPairing}
				Plays magnet sources through Limbo on {$limboPairing.name}.
			{:else}
				Play magnet sources through Limbo on a computer on your network.
			{/if}
		</p>
		{#if error}
			<p class="mt-1 text-red-300 text-xs">{error}</p>
		{/if}
	</div>
	<div class="flex items-center gap-2">
		{#if $limboPairing}
			<button
				class="pressable inline-flex min-h-10 items-center rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/16 cursor-pointer"
				on:click={unpair}
			>
				Unpair
			</button>
		{:else if $allowTorrenting}
			<button
				class="pressable inline-flex min-h-10 items-center rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/16 cursor-pointer"
				on:click={() => (pairing = true)}
			>
				Pair with Limbo
			</button>
		{/if}
		<button
			class={`relative w-16 h-9 rounded-full border border-white/10 transition-colors duration-200 cursor-pointer disabled:cursor-wait disabled:opacity-60 ${
				$allowTorrenting ? "bg-white" : "bg-white/10"
			}`}
			on:click={toggle}
			disabled={saving}
			aria-label="Toggle torrenting"
			role="switch"
			aria-checked={$allowTorrenting}
		>
			<span
				class={`absolute top-1 left-1 w-7 h-7 rounded-full text-[10px] font-semibold flex items-center justify-center transition-all duration-200 ${
					$allowTorrenting
						? "translate-x-7 bg-black text-white/90"
						: "translate-x-0 bg-white/80 text-black"
				}`}
			>
				{$allowTorrenting ? "On" : "Off"}
			</span>
		</button>
	</div>
</div>

{#if pairing}
	<LimboPairingModal onPaired={paired} onClose={() => (pairing = false)} />
{/if}
