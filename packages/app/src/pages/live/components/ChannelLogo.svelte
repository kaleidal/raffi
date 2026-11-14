<script lang="ts">
    import { logoUrl } from "../../../lib/live/network/proxy";
    import type { LiveChannel } from "../../../lib/live/types";

    export let channel: LiveChannel;
    export let size: "small" | "large" = "small";

    let failedFor = "";

    $: source = logoUrl(channel.logo);
    $: showLogo = Boolean(source) && failedFor !== source;
    $: initials = channel.name
        .replace(/[^\p{L}\p{N} ]/gu, " ")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
        .toUpperCase();
</script>

{#if showLogo}
    <img
        src={source}
        alt=""
        loading="lazy"
        decoding="async"
        draggable="false"
        class="h-full w-full object-contain {size === 'large' ? 'p-[18%]' : 'p-[12%]'}"
        onerror={() => (failedFor = source ?? "")}
    />
{:else}
    <span class="font-poppins font-semibold text-white/40 {size === 'large' ? 'text-3xl' : 'text-sm'}">{initials}</span>
{/if}
