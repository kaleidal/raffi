<script lang="ts">
    import { fade } from "svelte/transition";
    import LoadingSpinner from "../../../components/common/LoadingSpinner.svelte";
    import ChannelLogo from "../components/ChannelLogo.svelte";
    import type { LiveChannel } from "../../../lib/live/types";

    export let channel: LiveChannel | null;
    export let error: string | null;
    export let onRetry: () => void;
    export let onBack: () => void;
</script>

<div class="absolute inset-0 z-40 flex items-center justify-center bg-[#090909] px-6" transition:fade={{ duration: 200 }}>
    <div class="flex w-full max-w-lg flex-col items-center gap-6 text-center">
        {#if channel}
            <span class="flex h-28 aspect-[3/2] items-center justify-center overflow-hidden rounded-[24px] bg-white/[0.05]">
                <ChannelLogo {channel} size="large" />
            </span>
        {/if}
        {#if error}
            <div>
                <h1 class="text-balance font-poppins text-3xl font-semibold text-white">
                    {channel ? `Couldn't play ${channel.name}` : "Couldn't play this channel"}
                </h1>
                <p class="mt-3 text-pretty font-poppins text-[15px] leading-6 text-white/60">{error}</p>
            </div>
            <div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                {#if channel}
                    <button
                        class="rounded-xl bg-white px-7 py-3 text-[15px] font-semibold text-black hover:bg-white/88 cursor-pointer"
                        onclick={onRetry}
                        data-tv-autofocus
                    >
                        Try again
                    </button>
                {/if}
                <button class="rounded-xl bg-white/10 px-7 py-3 text-[15px] font-semibold text-white hover:bg-white/16 cursor-pointer" onclick={onBack}>
                    Back to channels
                </button>
            </div>
        {:else}
            <div class="flex flex-col items-center gap-4">
                {#if channel}
                    <p class="font-poppins text-xl font-medium text-white/85">{channel.name}</p>
                {/if}
                <LoadingSpinner size="40px" color="#D8D8D8" />
            </div>
        {/if}
    </div>
</div>
