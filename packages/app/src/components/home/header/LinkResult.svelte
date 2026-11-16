<script lang="ts">
    import { Link, Magnet } from "@lucide/svelte";
    import { fade } from "svelte/transition";
    import TorrentWarningModal from "../../meta/modals/TorrentWarningModal.svelte";
    import { playLink, type PlayableLink } from "../../../lib/streams/playableLink";
    import { openSettings } from "../../../lib/stores/settings";
    import {
        acknowledgeTorrentWarning,
        allowTorrenting,
        hasAcknowledgedTorrentWarning,
    } from "../../../lib/stores/torrenting";

    let { link, above }: { link: PlayableLink; above: boolean } = $props();

    let confirmingTorrent = $state(false);

    const blocked = $derived(link.kind === "magnet" && !$allowTorrenting);

    export function activate() {
        if (blocked) openSettings("streaming");
        else if (link.kind === "magnet" && !hasAcknowledgedTorrentWarning()) confirmingTorrent = true;
        else playLink(link);
    }

    function confirmTorrent() {
        acknowledgeTorrentWarning();
        confirmingTorrent = false;
        playLink(link);
    }
</script>

<button
    class="absolute left-1/2 z-100 flex w-[min(780px,76vw)] -translate-x-1/2 cursor-pointer items-center gap-4 rounded-[24px] bg-surface/90 p-4 text-left backdrop-blur-xl transition-colors hover:bg-surface {above
        ? 'bottom-[90px]'
        : 'top-[90px]'}"
    transition:fade={{ duration: 200 }}
    onmousedown={(event) => event.preventDefault()}
    onclick={activate}
>
    <span class="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
        {#if link.kind === "magnet"}
            <Magnet size={22} strokeWidth={2} />
        {:else}
            <Link size={22} strokeWidth={2} />
        {/if}
    </span>
    <span class="min-w-0 flex-1">
        <span class="block font-semibold text-ink">
            {blocked ? "Turn on torrenting to play this" : "Play this link"}
        </span>
        <span class="block truncate text-sm text-ink/50">{link.href}</span>
    </span>
</button>

{#if confirmingTorrent}
    <TorrentWarningModal onConfirm={confirmTorrent} onCancel={() => (confirmingTorrent = false)} />
{/if}
