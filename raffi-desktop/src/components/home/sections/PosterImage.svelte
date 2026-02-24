<script lang="ts">
    import { Film } from "lucide-svelte";

    export let src: string | null | undefined = null;
    export let title: string | null | undefined = null;
    export let alt = "Poster";

    let failed = false;

    $: normalizedSrc = String(src || "").trim();
    $: if (normalizedSrc) {
        failed = false;
    }

    $: displayTitle = String(title || "").trim();

    function handleError() {
        failed = true;
    }
</script>

{#if normalizedSrc && !failed}
    <img
        src={normalizedSrc}
        alt={alt}
        class="w-full h-full object-cover"
        on:error={handleError}
    />
{:else}
    <div
        class="w-full h-full bg-[#101014] border border-white/10 rounded-[inherit] flex flex-col items-center justify-center gap-3 p-4 text-center"
        aria-label={alt}
    >
        <Film size={26} strokeWidth={2} color="#8B8B95" />
        {#if displayTitle}
            <span class="text-[#B1B1BD] text-sm font-medium leading-[1.35] break-words max-w-full">
                {displayTitle}
            </span>
        {:else}
            <span class="text-[#9A9AA5] text-sm font-medium">Poster unavailable</span>
        {/if}
    </div>
{/if}
