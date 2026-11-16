<script lang="ts">
    import type { Snippet } from "svelte";

    let {
        title,
        description = "",
        children,
    }: {
        title: string;
        description?: string;
        children?: Snippet;
    } = $props();
</script>

<div class="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 py-3.5">
    <div class="min-w-0 flex-1 basis-60">
        <p class="font-medium text-ink">{title}</p>
        {#if description}
            <p class="mt-0.5 text-sm text-ink/55">{description}</p>
        {/if}
    </div>
    {@render children?.()}
</div>
