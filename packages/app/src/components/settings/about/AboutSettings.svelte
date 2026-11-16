<script lang="ts">
	import { ExternalLink } from "@lucide/svelte";
	import SettingRow from "../SettingRow.svelte";
	import UpdateSection from "./UpdateSection.svelte";

	const links = [
		{ title: "Report a problem", description: "Something broken or acting odd.", url: "https://github.com/kaleidal/raffi/issues" },
		{ title: "Ideas and questions", description: "Talk with other people using Raffi.", url: "https://github.com/kaleidal/raffi/discussions" },
	];

	function openExternalLink(url: string) {
		const openExternal = window.electronAPI?.openExternal;
		if (!openExternal) {
			window.location.assign(url);
			return;
		}
		openExternal(url).catch((error) => {
			console.error("Failed to open external link", error);
			window.location.assign(url);
		});
	}
</script>

<UpdateSection />

{#each links as link (link.url)}
	<SettingRow title={link.title} description={link.description}>
		<button
			class="inline-flex cursor-pointer items-center gap-2 rounded-full bg-ink/10 px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/16"
			on:click={() => openExternalLink(link.url)}
		>
			Open
			<ExternalLink size={15} strokeWidth={2} />
		</button>
	</SettingRow>
{/each}
