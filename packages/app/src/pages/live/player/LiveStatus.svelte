<script lang="ts">
    import { fade } from "svelte/transition";
    import Button from "../../../components/common/controls/Button.svelte";
    import ShapeLoader from "../../../components/common/loading/ShapeLoader.svelte";
    import ChannelLogo from "../components/ChannelLogo.svelte";
    import type { LiveChannel } from "../../../lib/live/types";

    let {
        channel,
        error,
        onRetry,
        onBack,
    }: {
        channel: LiveChannel | null;
        error: string | null;
        onRetry: () => void;
        onBack: () => void;
    } = $props();
</script>

<div class="absolute inset-0 z-40 flex items-center justify-center bg-canvas px-6" transition:fade={{ duration: 200 }}>
    <div class="flex w-full max-w-lg flex-col items-center gap-6 text-center">
        {#if channel}
            <span class="flex h-28 aspect-[3/2] items-center justify-center overflow-hidden rounded-[24px] bg-ink/[0.05]">
                <ChannelLogo {channel} size="large" />
            </span>
        {/if}
        {#if error}
            <div>
                <h1 class="text-balance text-3xl font-semibold text-ink">
                    {channel ? `Couldn't play ${channel.name}` : "Couldn't play this channel"}
                </h1>
                <p class="mt-3 text-pretty text-[15px] leading-6 text-ink/60">{error}</p>
            </div>
            <div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                {#if channel}
                    <Button variant="primary" onclick={onRetry} data-tv-autofocus>Try again</Button>
                {/if}
                <Button onclick={onBack}>Back to channels</Button>
            </div>
        {:else}
            <div class="flex flex-col items-center gap-4">
                {#if channel}
                    <p class="text-xl font-medium text-ink/85">{channel.name}</p>
                {/if}
                <ShapeLoader size="40px" />
            </div>
        {/if}
    </div>
</div>
