<script lang="ts">
    import { fade } from "svelte/transition";
    
    let { screenshots = [] }: { screenshots?: string[] } = $props();

    type LightboxState = { src: string; alt: string } | null;
    let lightbox: LightboxState = $state(null);

    function openLightbox(src: string, i: number) {
        lightbox = { src, alt: `Raffi screenshot ${i + 1}` };
    }

    function closeLightbox() {
        lightbox = null;
    }

    function onKeydown(e: KeyboardEvent) {
        if (!lightbox) return;
        if (e.key === "Escape") closeLightbox();
    }
</script>

<svelte:window onkeydown={onKeydown} />

<div in:fade={{ duration: 220 }} class="mx-auto max-w-6xl px-6">
    <div class="grid gap-10 md:grid-cols-12 md:gap-12">
        <div class="md:col-span-5">
            <h2 class="font-poppins text-[28px] leading-[1.1] tracking-[-0.03em] md:text-[34px]">
                Gallery
            </h2>
            <p class="mt-4 text-[15px] leading-6 text-neutral-600 md:text-[16px] md:leading-7">
                A closer look at the library, details, and playback flow — built to stay out of your way.
            </p>
            <p class="mt-4 text-[13px] leading-5 text-neutral-500">
                Click any image to view it full size.
            </p>
        </div>
    </div>
</div>

<div class="mt-10 md:mt-12">
    <div class="mx-auto max-w-6xl px-6">
        <div class="grid gap-4 md:grid-cols-12">
            {#each screenshots as src, i (src)}
                <button
                    type="button"
                    onclick={() => openLightbox(src, i)}
                    class="group relative overflow-hidden rounded-3xl bg-neutral-100 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30 md:col-span-6 {i === 0 && 'md:col-span-12'} {i === 1 && 'md:col-span-7'} {i === 2 && 'md:col-span-5'} {i === 3 && 'md:col-span-5'} {i === 4 && 'md:col-span-7'}"
                >
                    <img
                        {src}
                        alt="Raffi screenshot {i + 1}"
                        class="aspect-video w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.015]"
                        loading="lazy"
                    />
                    <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-black/0 to-black/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
                </button>
            {/each}
        </div>
    </div>
</div>

{#if lightbox}
    <div class="fixed inset-0 z-50">
        <button
            type="button"
            onclick={closeLightbox}
            class="absolute inset-0 bg-black/70"
            aria-label="Close screenshot preview"
        ></button>

        <div class="pointer-events-none absolute inset-0 flex items-center justify-center px-4 py-10">
            <div class="pointer-events-auto w-full max-w-6xl">
                <div class="flex items-center justify-end">
                    <button
                        type="button"
                        onclick={closeLightbox}
                        class="inline-flex h-10 items-center rounded-xl bg-white/10 px-4 text-[13px] font-medium text-white ring-1 ring-white/15 hover:bg-white/15"
                    >
                        Close
                    </button>
                </div>

                <div class="mt-4 overflow-hidden rounded-3xl bg-black">
                    <img src={lightbox.src} alt={lightbox.alt} class="max-h-[78svh] w-full object-contain" />
                </div>
            </div>
        </div>
    </div>
{/if}
