<script lang="ts">
	import CommunityAddonsSection from "./CommunityAddonsSection.svelte";
	import InstalledAddonsSection from "./InstalledAddonsSection.svelte";
	import type { AddonResourceFilter } from "../../../lib/stores/settings";

	let { filter }: { filter: AddonResourceFilter } = $props();
</script>

<div class="flex flex-col gap-10">
	<InstalledAddonsSection />
	<CommunityAddonsSection initialResourceFilter={filter} />
</div>
