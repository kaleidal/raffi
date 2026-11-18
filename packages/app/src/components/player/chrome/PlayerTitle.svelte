<script lang="ts">
    import type { ShowResponse } from "../../../lib/library/types/meta_types";
    import { episodeLine } from "./episodeLine";

    let { metaData, season, episode }: { metaData: ShowResponse; season: number | null; episode: number | null } = $props();

    let logoFailed = $state(false);

    const meta = $derived(metaData.meta);
    const line = $derived(episodeLine(metaData, season, episode));
</script>

<div class="flex min-w-0 flex-col items-start gap-[clamp(6px,0.6vw,10px)]">
    {#if meta.logo && !logoFailed}
        <img
            src={meta.logo}
            alt={meta.name}
            class="h-[clamp(36px,3.4vw,64px)] w-auto max-w-[min(340px,60vw)] object-contain object-left"
            onerror={() => (logoFailed = true)}
        />
    {:else}
        <span class="truncate text-[clamp(20px,1.7vw,30px)] font-semibold text-ink">{meta.name}</span>
    {/if}
    {#if line}
        <span class="max-w-full truncate text-[clamp(14px,1vw,18px)] font-medium whitespace-pre text-ink/75">{line}</span>
    {/if}
</div>
