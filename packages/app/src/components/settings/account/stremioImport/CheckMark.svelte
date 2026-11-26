<script lang="ts">
    import { Check } from "@lucide/svelte";

    let { checked = false }: { checked?: boolean } = $props();
</script>

<span
    class="mt-0.5 h-5 w-5 shrink-0 rounded-md border transition-colors flex items-center justify-center {checked ? 'bg-ink border-ink' : 'border-ink/25 bg-ink/5'}"
    aria-hidden="true"
>
    {#if checked}
        <Check size={14} strokeWidth={2.5} class="text-canvas" />
    {/if}
</span>
