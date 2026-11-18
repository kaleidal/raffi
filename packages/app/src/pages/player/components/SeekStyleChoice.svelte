<script lang="ts">
    import { fly } from "svelte/transition";
    import type { SeekBarStyle } from "../controls/seekStyle";

    let { style, onChange, onContinue }: { style: SeekBarStyle; onChange: (style: SeekBarStyle) => void; onContinue: () => void } = $props();

    const options: Array<{ value: SeekBarStyle; label: string }> = [
        { value: "raffi", label: "Raffi" },
        { value: "normal", label: "Normal" },
    ];
</script>

<div class="flex w-full max-w-md flex-col items-start gap-5" in:fly={{ y: 10, duration: 320 }}>
    <div>
        <h1 class="text-[clamp(26px,2.2vw,38px)] leading-tight font-semibold">Choose how seeking feels</h1>
        <p class="mt-2 text-[clamp(14px,1vw,17px)] text-pretty text-ink/65">
            Raffi's bar runs backwards: drag left to go forward, and the clock counts down.
        </p>
    </div>
    <div class="relative grid w-full grid-cols-2 rounded-full bg-ink/10 p-1" role="radiogroup" aria-label="Seek direction">
        <span
            class="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-accent transition-transform duration-200"
            class:translate-x-full={style === "normal"}
        ></span>
        {#each options as option (option.value)}
            <button
                class="relative z-10 h-10 cursor-pointer rounded-full text-[15px] font-semibold transition-colors duration-200 {style === option.value
                    ? 'text-on-accent'
                    : 'text-ink/65 hover:text-ink'}"
                role="radio"
                aria-checked={style === option.value}
                onclick={() => onChange(option.value)}
            >
                {option.label}
            </button>
        {/each}
    </div>
    <button
        class="w-full cursor-pointer rounded-full bg-ink/10 px-7 py-3 text-[15px] font-semibold text-ink transition-colors hover:bg-ink/16"
        onclick={onContinue}
    >
        Continue
    </button>
</div>
