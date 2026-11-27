<script lang="ts">
    import { logoUrl } from "../../../lib/live/network/proxy";
    import type { LiveChannel } from "../../../lib/live/types";

    let { channel, size = "small" }: { channel: LiveChannel; size?: "small" | "large" } = $props();

    let failedFor = $state("");

    const source = $derived(logoUrl(channel.logo));
    const showLogo = $derived(Boolean(source) && failedFor !== source);
    const initials = $derived(
        channel.name
            .replace(/[^\p{L}\p{N} ]/gu, " ")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((word) => word[0])
            .join("")
            .toUpperCase(),
    );
</script>

{#if showLogo}
    <img
        src={source}
        alt=""
        width="120"
        height="80"
        loading="lazy"
        decoding="async"
        draggable="false"
        class="h-full w-full object-contain {size === 'large' ? 'p-[18%]' : 'p-[12%]'}"
        onerror={() => (failedFor = source ?? "")}
    />
{:else}
    <span class="font-semibold text-ink/40 {size === 'large' ? 'text-3xl' : 'text-sm'}">{initials}</span>
{/if}
