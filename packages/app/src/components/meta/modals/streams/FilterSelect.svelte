<script lang="ts">
    export let label: string;
</script>

<label class="flex min-w-0 flex-col gap-2">
    <span class="text-xs text-white/45">{label}</span>
    <slot />
</label>
