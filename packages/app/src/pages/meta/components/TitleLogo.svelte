<script lang="ts">
    import { onMount } from "svelte";

    let {
        logo,
        name,
        progress,
        onLogoError,
    }: { logo: string | null; name: string; progress: number | null; onLogoError: () => void } = $props();

    let entered = $state(false);
    const revealing = $derived(progress !== null && progress > 0 && progress < 1);
    const shown = $derived(entered && progress !== null ? progress * 100 : 0);

    onMount(() => {
        const frame = requestAnimationFrame(() => (entered = true));
        return () => cancelAnimationFrame(frame);
    });
</script>

<div class="relative max-w-full" class:revealing>
    {#if logo}
        <img
            src={logo}
            alt={name}
            class="block h-[clamp(140px,12.5vw,250px)] w-auto max-w-full object-contain object-left"
            onerror={onLogoError}
        />
        {#if revealing}
            <img src={logo} alt="" aria-hidden="true" class="reveal absolute inset-0 h-full w-full object-contain object-left" style="--shown: {shown}%" />
        {/if}
    {:else}
        <h1 class="max-w-200 text-[clamp(38px,3.5vw,58px)] leading-tight font-bold text-ink/90">{name}</h1>
        {#if revealing}
            <span aria-hidden="true" style="--shown: {shown}%" class="reveal absolute inset-0 text-[clamp(38px,3.5vw,58px)] leading-tight font-bold text-ink/90">{name}</span>
        {/if}
    {/if}
</div>

<style>
    .revealing > :first-child {
        filter: grayscale(1);
        opacity: 0.3;
    }

    @property --shown {
        syntax: "<percentage>";
        inherits: false;
        initial-value: 0%;
    }

    .reveal {
        mask-image: linear-gradient(to right, #000 calc(var(--shown) - 2%), transparent calc(var(--shown) + 2%));
        transition: --shown 1100ms cubic-bezier(0.2, 0, 0, 1);
    }

    @media (prefers-reduced-motion: reduce) {
        .reveal {
            transition: none;
        }
    }
</style>
