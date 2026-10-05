<script lang="ts">
    import { Film } from "@lucide/svelte";

    export let src: string | null | undefined = null;
    export let title: string | null | undefined = null;
    export let alt = "Poster";

    let failed = false;
    let loaded = false;
    let activeSrc = "";

    $: normalizedSrc = String(src || "").trim();
    $: if (normalizedSrc !== activeSrc) {
        activeSrc = normalizedSrc;
        failed = false;
        loaded = false;
    }

    $: displayTitle = String(title || "").trim();

    function handleError() {
        failed = true;
        loaded = false;
    }
</script>

{#if normalizedSrc && !failed}
    <div class="relative h-full w-full overflow-hidden rounded-[inherit] bg-[#141419]">
        <div
            class="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.015)_45%,rgba(255,255,255,0.05))] transition-opacity duration-300 {loaded ? 'opacity-0' : 'opacity-100'}"
            aria-hidden="true"
        ></div>
        <img
            src={normalizedSrc}
            alt={alt}
            loading="lazy"
            decoding="async"
            draggable="false"
            class="block h-full w-full object-cover opacity-0 transition-opacity duration-300 ease-out {loaded ? 'opacity-100' : ''}"
            on:load={() => (loaded = true)}
            on:error={handleError}
        />

        <div
            class="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_1px_rgba(9,9,9,0.88)]"
            aria-hidden="true"
        ></div>
    </div>
{:else}
    <div
        class="flex h-full w-full flex-col items-center justify-center gap-3 rounded-[inherit] border border-white/10 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.075),transparent_58%),#101014] p-4 text-center"
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
