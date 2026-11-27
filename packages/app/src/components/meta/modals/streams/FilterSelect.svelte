<script lang="ts">
    import type { Snippet } from "svelte";

    let { label, children }: { label: string; children: Snippet } = $props();
</script>

<label class="flex min-w-0 flex-col gap-2">
    <span class="text-xs text-ink/45">{label}</span>
    {@render children()}
</label>
