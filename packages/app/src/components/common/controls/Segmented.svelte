<script lang="ts" generics="Value extends string">
    let {
        value,
        options,
        label,
        disabled = false,
        onChange,
    }: {
        value: Value;
        options: ReadonlyArray<{ value: Value; label: string }>;
        label: string;
        disabled?: boolean;
        onChange: (value: Value) => void;
    } = $props();

    const index = $derived(Math.max(0, options.findIndex((option) => option.value === value)));
</script>

<div role="radiogroup" aria-label={label} class="relative flex h-10 shrink-0 rounded-full bg-ink/10 p-1">
    <span
        class="absolute top-1 bottom-1 left-1 rounded-full bg-accent transition-transform duration-200"
        style="width: calc((100% - 8px) / {options.length}); transform: translateX({index * 100}%)"
    ></span>
    {#each options as option (option.value)}
        <button
            type="button"
            role="radio"
            aria-checked={option.value === value}
            {disabled}
            class="relative z-10 min-w-20 flex-1 cursor-pointer px-3 disabled:cursor-wait text-sm font-medium transition-colors duration-200 {option.value === value
                ? 'text-on-accent'
                : 'text-ink/60 hover:text-ink'}"
            onclick={() => onChange(option.value)}
        >
            {option.label}
        </button>
    {/each}
</div>
