<script lang="ts">
    import { onMount } from "svelte";

    let {
        logo,
        name,
        progress,
        pending = false,
        compact = false,
        onLogoError,
    }: {
        logo: string | null;
        name: string;
        progress: number | null;
        pending?: boolean;
        compact?: boolean;
        onLogoError: () => void;
    } = $props();

    let entered = $state(false);
    const filling = $derived(progress !== null && progress > 0 && progress < 1);
    const revealing = $derived(pending || filling);
    const shown = $derived(entered && progress !== null ? progress * 100 : 0);

    onMount(() => {
        const frame = requestAnimationFrame(() => (entered = true));
        return () => cancelAnimationFrame(frame);
    });
</script>

<div class="relative max-w-full" class:revealing class:compact>
    {#if logo}
        <img src={logo} alt={name} class="logo block w-auto max-w-full object-contain object-left" onerror={onLogoError} />
        {#if revealing}
            <img
                src={logo}
                alt=""
                aria-hidden="true"
                class="reveal absolute inset-0 h-full w-full object-contain object-left"
                class:sweep={!filling}
                style="--shown: {shown}%"
            />
        {/if}
    {:else}
        <h1 class="name max-w-200 leading-tight font-bold text-ink/90">{name}</h1>
        {#if revealing}
            <span
                aria-hidden="true"
                class="name reveal absolute inset-0 leading-tight font-bold text-ink/90"
                class:sweep={!filling}
                style="--shown: {shown}%">{name}</span
            >
        {/if}
    {/if}
</div>

<style>
    .logo {
        height: clamp(140px, 12.5vw, 250px);
    }

    .compact .logo {
        height: clamp(96px, 8.5vw, 170px);
    }

    .name {
        font-size: clamp(38px, 3.5vw, 58px);
    }

    .revealing > :first-child {
        filter: grayscale(1);
        opacity: 0.3;
    }

    @property --shown {
        syntax: "<percentage>";
        inherits: false;
        initial-value: 0%;
    }

    @property --sweep {
        syntax: "<percentage>";
        inherits: false;
        initial-value: -40%;
    }

    .reveal {
        mask-image: linear-gradient(to right, #000 calc(var(--shown) - 2%), transparent calc(var(--shown) + 2%));
        transition: --shown 1100ms cubic-bezier(0.2, 0, 0, 1);
    }

    .reveal.sweep {
        mask-image: linear-gradient(
            to right,
            transparent calc(var(--sweep) - 35%),
            #000 var(--sweep),
            transparent calc(var(--sweep) + 35%)
        );
        animation: sweep 2.4s cubic-bezier(0.45, 0, 0.25, 1) infinite;
    }

    @keyframes sweep {
        to {
            --sweep: 140%;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .reveal {
            transition: none;
        }

        .reveal.sweep {
            animation: none;
            --sweep: 50%;
        }
    }
</style>
