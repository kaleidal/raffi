<script lang="ts">
    import StreamsPopup from "../../../components/meta/modals/StreamsPopup.svelte";
    import TorrentWarningModal from "../../../components/meta/modals/TorrentWarningModal.svelte";
    import type { ShowResponse } from "../../../lib/library/types/meta_types";
    import type { ProgressMap } from "../types";

    export let streamsPopupVisible: boolean;
    export let showTorrentWarning: boolean;
    export let addons: any[];
    export let selectedAddon: any;
    export let loadingStreams: boolean;
    export let streams: any[];
    export let metaData: ShowResponse | null;
    export let selectedEpisode: any;
    export let progressMap: ProgressMap | null;
    export let progressSignature: string | number | null = null;

    export let onCloseStreamsPopup: () => void;
    export let onStreamClick: (stream: any) => void;
    export let onTorrentConfirm: () => void;
    export let onTorrentCancel: () => void;
</script>

<StreamsPopup
    bind:streamsPopupVisible
    {addons}
    bind:selectedAddon
    {loadingStreams}
    {streams}
    {metaData}
    {selectedEpisode}
    {progressMap}
    {progressSignature}
    on:close={onCloseStreamsPopup}
    on:streamClick={(e) => onStreamClick(e.detail)}
/>

{#if showTorrentWarning}
    <TorrentWarningModal
        on:confirm={onTorrentConfirm}
        on:cancel={onTorrentCancel}
    />
{/if}
