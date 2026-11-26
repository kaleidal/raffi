<script lang="ts">
    import { onMount } from "svelte";

    let {
        value = $bindable(""),
        disabled = false,
        label = "Sign-in code",
        onComplete,
    }: { value?: string; disabled?: boolean; label?: string; onComplete: () => void } = $props();

    const CODE_LENGTH = 6;
    const slots = Array.from({ length: CODE_LENGTH }, (_, index) => index);

    let input: HTMLInputElement;
    let focused = $state(false);

    const activeSlot = $derived(Math.min(value.length, CODE_LENGTH - 1));

    const handleInput = () => {
        value = input.value.replace(/\D/g, "").slice(0, CODE_LENGTH);
        input.value = value;
        if (value.length === CODE_LENGTH) onComplete();
    };

    onMount(() => input.focus());
</script>

<label class="relative grid grid-cols-6 gap-2">
    {#each slots as slot}
        <span
            class="h-14 rounded-2xl flex items-center justify-center text-ink text-2xl font-semibold transition-colors duration-200 {focused && slot === activeSlot ? 'bg-ink/16' : 'bg-ink/8'}"
        >
            {#if value[slot]}
                {value[slot]}
            {:else if focused && slot === activeSlot}
                <span class="h-6 w-[2px] rounded-full bg-ink/70 caret"></span>
            {/if}
        </span>
    {/each}
    <input
        bind:this={input}
        {value}
        readonly={disabled}
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength={CODE_LENGTH}
        aria-label={label}
        class="absolute inset-0 w-full h-full opacity-0 cursor-text"
        oninput={handleInput}
        onfocus={() => (focused = true)}
        onblur={() => (focused = false)}
    />
</label>

<style>
    .caret {
        animation: blink 1s steps(2, start) infinite;
    }

    @keyframes blink {
        to {
            visibility: hidden;
        }
    }
</style>
