<script lang="ts">
    import WatchPartyOverlay from "../../../components/player/watch_party/WatchPartyOverlay.svelte";
    import WatchPartyEndModal from "../../../components/player/watch_party/WatchPartyEndModal.svelte";

    export let showPartyEndModal: boolean;
    export let partyEndReason: "host_left" | "party_deleted";
    export let onContinue: () => void;
    export let onLeave: () => void;
</script>

{#if showPartyEndModal}
    <WatchPartyEndModal reason={partyEndReason} {onContinue} {onLeave} />
{/if}

<WatchPartyOverlay />
