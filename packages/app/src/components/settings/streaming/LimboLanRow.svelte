<script lang="ts">
	import LimboPairingModal from "./LimboPairingModal.svelte";
	import Toggle from "../../common/controls/Toggle.svelte";
	import SettingRow from "../SettingRow.svelte";
	import { allowTorrenting, setTorrentingAllowed } from "../../../lib/stores/torrenting";
	import { forgetLimbo, limboPairing } from "../../../lib/streams/limboLan";

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

<SettingRow
	title="Allow torrenting"
	description={$limboPairing
		? `Plays magnet sources through Limbo on ${$limboPairing.name}.`
		: "Plays magnet sources through Limbo on a computer on your network."}
>
	<div class="flex items-center gap-3">
		{#if $limboPairing}
			<button
				class="cursor-pointer rounded-full bg-ink/10 px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/16"
				on:click={unpair}
			>
				Unpair
			</button>
		{:else if $allowTorrenting}
			<button
				class="cursor-pointer rounded-full bg-ink/10 px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/16"
				on:click={() => (pairing = true)}
			>
				Pair with Limbo
			</button>
		{/if}
		<Toggle checked={$allowTorrenting} label="Allow torrenting" disabled={saving} onChange={toggle} />
	</div>
</SettingRow>
{#if error}
	<p class="-mt-2 pb-2 text-sm text-danger">{error}</p>
{/if}

{#if pairing}
	<LimboPairingModal onPaired={paired} onClose={() => (pairing = false)} />
{/if}
