<script lang="ts">
	import Segmented from "../../common/controls/Segmented.svelte";
	import Toggle from "../../common/controls/Toggle.svelte";
	import SettingRow from "../SettingRow.svelte";
	import { liveLayout, showLiveInHeader, type LiveLayout } from "../../../lib/live/preferences";

	const layouts: ReadonlyArray<{ value: LiveLayout; label: string }> = [
		{ value: "auto", label: "Auto" },
		{ value: "guide", label: "Guide" },
		{ value: "grid", label: "Grid" },
	];
</script>

<SettingRow title="Show in header" description="Keeps Live TV next to your lists.">
	<Toggle checked={$showLiveInHeader} label="Show Live TV in the header" onChange={(value) => showLiveInHeader.set(value)} />
</SettingRow>

<SettingRow title="Channel layout" description="Auto shows the guide when your source has one.">
	<Segmented value={$liveLayout} options={layouts} label="Channel layout" onChange={(value) => liveLayout.set(value)} />
</SettingRow>
