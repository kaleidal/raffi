<script lang="ts">
    import { Film } from "@lucide/svelte";

    export let src: string | null | undefined = null;
    export let title: string | null | undefined = null;
    export let year: string | null | undefined = null;
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
    $: displayYear = String(year || "").trim();

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
            class="h-full w-full object-cover opacity-0 transition-[opacity,transform] duration-300 ease-out group-hover/poster:scale-[1.025] group-focus-visible/poster:scale-[1.025] {loaded ? 'opacity-100' : ''}"
            on:load={() => (loaded = true)}
            on:error={handleError}
        />

        {#if displayTitle}
            <div
                class="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-2 flex-col justify-end bg-gradient-to-t from-black/90 via-black/45 to-transparent px-4 pb-4 pt-14 text-left opacity-0 transition-[opacity,transform] duration-200 ease-out group-hover/poster:translate-y-0 group-hover/poster:opacity-100 group-focus-visible/poster:translate-y-0 group-focus-visible/poster:opacity-100"
            >
                <span class="line-clamp-2 text-sm font-semibold leading-snug text-white">
                    {displayTitle}
                </span>
                {#if displayYear}
                    <span class="mt-0.5 text-xs font-medium text-white/62">{displayYear}</span>
                {/if}
            </div>
        {/if}
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
