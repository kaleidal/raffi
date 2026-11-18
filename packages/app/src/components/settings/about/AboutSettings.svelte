<script lang="ts">
	import { ExternalLink } from "@lucide/svelte";
	import { openExternal } from "../../../lib/shell/openExternal";
	import RaffiMark from "../../common/RaffiMark.svelte";
	import SettingRow from "../SettingRow.svelte";
	import UpdateSection from "./UpdateSection.svelte";
	import { secondaryButton } from "../buttons";
	import { appVersion, platformLabel } from "../../../lib/shell/appInfo";

	const links = [
		{ title: "Website", description: "raffi.al", url: "https://raffi.al" },
		{ title: "Source code", description: "Open source under the MIT license.", url: "https://github.com/kaleidal/raffi" },
		{ title: "Report a problem", description: "Something broken or acting odd.", url: "https://github.com/kaleidal/raffi/issues" },
		{ title: "Ideas and questions", description: "Talk with other people using Raffi.", url: "https://github.com/kaleidal/raffi/discussions" },
	];

</script>

<div class="flex items-center gap-4 pb-6">
	<RaffiMark class="h-14 w-auto text-ink/85" />
	<div>
		<p class="text-xl font-semibold text-ink">Raffi {appVersion}</p>
		<p class="text-sm text-ink/55">{platformLabel()}</p>
	</div>
</div>

<UpdateSection />

{#each links as link (link.url)}
	<SettingRow title={link.title} description={link.description}>
		<button class={secondaryButton} on:click={() => void openExternal(link.url)}>
			Open
			<ExternalLink size={15} strokeWidth={2} />
		</button>
	</SettingRow>
{/each}
