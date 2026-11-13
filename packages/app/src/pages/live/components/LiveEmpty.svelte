<script lang="ts">
    import { fade } from "svelte/transition";

    export let title: string;
    export let actionLabel: string;
    export let onAction: () => void;
</script>

<div class="flex flex-1 items-center justify-center pb-[10vh]" in:fade={{ duration: 300 }}>
    <div class="flex max-w-md flex-col items-center gap-5 text-center">
        <div>
            <h3 class="font-poppins text-2xl font-semibold text-white">{title}</h3>
            <p class="mt-2 font-poppins text-sm text-white/50"><slot /></p>
        </div>
        <button
            class="rounded-2xl bg-white px-5 py-2.5 font-poppins font-semibold text-black hover:bg-white/90 cursor-pointer"
            onclick={onAction}
            data-tv-autofocus
        >
            {actionLabel}
        </button>
    </div>
</div>
