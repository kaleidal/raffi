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
    <div class="relative h-full w-full overflow-hidden rounded-[inherit] bg-surface">
        <div
            class="absolute inset-0 bg-gradient-to-br from-ink/7 via-ink/2 to-ink/5 transition-opacity duration-300 {loaded ? 'opacity-0' : 'opacity-100'}"
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
            class="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-canvas/88"
            aria-hidden="true"
        ></div>
    </div>
{:else}
    <div
        class="flex h-full w-full flex-col items-center justify-center gap-3 rounded-[inherit] bg-ink/8 p-4 text-center"
        aria-label={alt}
    >
        <Film size={26} strokeWidth={2} class="text-ink/50" />
        {#if displayTitle}
            <span class="text-ink/70 text-sm font-medium leading-[1.35] break-words max-w-full">
                {displayTitle}
            </span>
        {:else}
            <span class="text-ink/60 text-sm font-medium">Poster unavailable</span>
        {/if}
    </div>
{/if}
