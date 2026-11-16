<script lang="ts">
    let {
        checked,
        label,
        disabled = false,
        onChange,
    }: {
        checked: boolean;
        label: string;
        disabled?: boolean;
        onChange: (checked: boolean) => void;
    } = $props();
</script>

<button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    {disabled}
    class="relative h-8 w-14 shrink-0 cursor-pointer rounded-full transition-colors duration-200 disabled:cursor-wait disabled:opacity-60 {checked
        ? 'bg-accent'
        : 'bg-ink/15'}"
    onclick={() => onChange(!checked)}
>
    <span
        class="absolute top-1 left-1 size-6 rounded-full transition-[translate,background-color] duration-200 {checked
            ? 'translate-x-6 bg-on-accent'
            : 'bg-ink/75'}"
    ></span>
</button>
