<script lang="ts">
    import { fade } from "svelte/transition";

    export let title: string;
    export let actionLabel: string;
    export let onAction: () => void;
</script>

<div class="flex flex-1 items-center justify-center pb-[10vh]" in:fade={{ duration: 300 }}>
    <div class="flex max-w-md flex-col items-center gap-5 text-center">
        <div>
            <h3 class="text-2xl font-semibold text-ink">{title}</h3>
            <p class="mt-2 text-sm text-ink/50"><slot /></p>
        </div>
        <button
            class="rounded-2xl bg-accent px-5 py-2.5 font-semibold text-on-accent hover:bg-accent/85 cursor-pointer"
            onclick={onAction}
            data-tv-autofocus
        >
            {actionLabel}
        </button>
    </div>
</div>
