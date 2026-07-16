<script lang="ts">
    import { Tv } from "@lucide/svelte";
    import type { IptvChannel } from "../../../lib/iptv/types";

    export let channel: IptvChannel;
    export let shouldShowLogo: (channel: IptvChannel) => boolean = () => false;
    export let markLogoFailed: (logo: string | undefined) => void = () => {};
</script>

<div class="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-black/32 ring-1 ring-white/[0.06]">
    {#if shouldShowLogo(channel)}
        <img
            src={channel.logo}
            alt=""
            class="max-h-full max-w-full object-contain"
            loading="lazy"
            onerror={() => markLogoFailed(channel.logo)}
        />
    {:else}
        <Tv size={22} strokeWidth={2} class="text-white/34" />
    {/if}
</div>
