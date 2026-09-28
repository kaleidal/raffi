<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";

    export let value = "";
    export let disabled = false;

    const CODE_LENGTH = 6;
    const slots = Array.from({ length: CODE_LENGTH }, (_, index) => index);
    const dispatch = createEventDispatcher<{ complete: { value: string } }>();

    let input: HTMLInputElement;
    let focused = false;

    $: activeSlot = Math.min(value.length, CODE_LENGTH - 1);

    const handleInput = () => {
        value = input.value.replace(/\D/g, "").slice(0, CODE_LENGTH);
        input.value = value;
        if (value.length === CODE_LENGTH) dispatch("complete", { value });
    };

    onMount(() => input.focus());
</script>

<label class="relative grid grid-cols-6 gap-2">
    {#each slots as slot}
        <span
            class="h-14 rounded-2xl flex items-center justify-center text-white text-2xl font-semibold transition-colors duration-200 {focused && slot === activeSlot ? 'bg-white/16' : 'bg-white/8'}"
        >
            {#if value[slot]}
                {value[slot]}
            {:else if focused && slot === activeSlot}
                <span class="h-6 w-[2px] rounded-full bg-white/70 caret"></span>
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
        aria-label="Sign-in code"
        class="absolute inset-0 w-full h-full opacity-0 cursor-text"
        on:input={handleInput}
        on:focus={() => (focused = true)}
        on:blur={() => (focused = false)}
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
