<script lang="ts">
	import { secondaryButton } from "../buttons";
	import { Download } from "@lucide/svelte";
	import Toggle from "../../common/controls/Toggle.svelte";
	import SettingRow from "../SettingRow.svelte";
	import DirectSourceSection from "./DirectSourceSection.svelte";
	import LimboLanRow from "./LimboLanRow.svelte";
	import { isAndroidPlatform } from "../../../lib/shell/platform";
	import { allowTorrenting, setTorrentingAllowed } from "../../../lib/stores/torrenting";
	import { LIMBO_INSTALL_URL } from "../../../lib/streams/limboClient";

	let torrentingSaving = false;
	let torrentingError = "";

	async function setTorrenting(enabled: boolean) {
		torrentingSaving = true;
		torrentingError = "";
		try {
			await setTorrentingAllowed(enabled);
		} catch (error) {
			console.error("Failed to update torrenting setting", error);
			torrentingError =
				error instanceof Error ? error.message : "Could not update torrenting. Make sure Limbo is running.";
		} finally {
			torrentingSaving = false;
		}
	}
</script>

<DirectSourceSection />

{#if isAndroidPlatform}
	<LimboLanRow />
{:else}
	<SettingRow title="Allow torrenting" description="Plays magnet sources through Limbo while it's open.">
		<div class="flex items-center gap-3">
			<a
				href={LIMBO_INSTALL_URL}
				target="_blank"
				rel="noreferrer"
				class={secondaryButton}
			>
				<Download size={16} strokeWidth={2} />
				Get Limbo
			</a>
			<Toggle checked={$allowTorrenting} label="Allow torrenting" disabled={torrentingSaving} onChange={setTorrenting} />
		</div>
	</SettingRow>
	{#if torrentingError}
		<p class="-mt-2 pb-2 text-sm text-danger">{torrentingError}</p>
	{/if}
{/if}
