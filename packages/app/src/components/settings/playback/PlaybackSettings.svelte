<script lang="ts">
	import Segmented from "../../common/controls/Segmented.svelte";
	import Toggle from "../../common/controls/Toggle.svelte";
	import SettingRow from "../SettingRow.svelte";
	import { enableRPC, disableRPC } from "../../../lib/shell/rpc";
	import { isDesktopPlatform } from "../../../lib/shell/platform";
	import { autoSkipIntros, miniPlayerOnMinimize } from "../../../lib/stores/playbackPreferences";

	type SeekBarStyle = "raffi" | "normal";

	const seekBarStyles: ReadonlyArray<{ value: SeekBarStyle; label: string }> = [
		{ value: "raffi", label: "Raffi" },
		{ value: "normal", label: "Normal" },
	];

	let discordRpcEnabled = localStorage.getItem("discord_rpc_enabled") !== "false";
	let seekBarStyle = (localStorage.getItem("seek_bar_style") || "raffi") as SeekBarStyle;

	function setDiscordRpc(enabled: boolean) {
		discordRpcEnabled = enabled;
		localStorage.setItem("discord_rpc_enabled", String(enabled));
		if (enabled) enableRPC();
		else disableRPC();
	}

	function setSeekBarStyle(style: SeekBarStyle) {
		seekBarStyle = style;
		localStorage.setItem("seek_bar_style", style);
	}
</script>

<SettingRow title="Seek bar style" description="Raffi fills the bar inverted over the picture.">
	<Segmented value={seekBarStyle} options={seekBarStyles} label="Seek bar style" onChange={setSeekBarStyle} />
</SettingRow>

<SettingRow title="Skip intros and recaps" description="Jumps past detected intro and recap chapters.">
	<Toggle checked={$autoSkipIntros} label="Skip intros and recaps" onChange={(value) => autoSkipIntros.set(value)} />
</SettingRow>

{#if isDesktopPlatform}
	<SettingRow title="Mini player on minimize" description="Keeps playback in a small window on top while Raffi is minimized.">
		<Toggle checked={$miniPlayerOnMinimize} label="Mini player on minimize" onChange={(value) => miniPlayerOnMinimize.set(value)} />
	</SettingRow>

	<SettingRow title="Discord Rich Presence" description="Lets friends see what you're watching.">
		<Toggle checked={discordRpcEnabled} label="Discord Rich Presence" onChange={setDiscordRpc} />
	</SettingRow>
{/if}
