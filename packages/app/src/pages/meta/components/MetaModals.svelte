<script lang="ts">
    import StreamsPopup from "../../../components/meta/modals/StreamsPopup.svelte";
    import TorrentWarningModal from "../../../components/meta/modals/TorrentWarningModal.svelte";
    import type { ShowResponse } from "../../../lib/library/types/meta_types";
    import type { ProgressMap } from "../../../lib/library/types/progress";

    let {
        streamsPopupVisible = $bindable(),
        showTorrentWarning,
        addons,
        selectedAddon = $bindable(),
        loadingStreams,
        streams,
        metaData,
        selectedEpisode,
        progressMap,
        progressSignature = null,
        onCloseStreamsPopup,
        onStreamClick,
        onTorrentConfirm,
        onTorrentCancel,
    }: {
        streamsPopupVisible: boolean;
        showTorrentWarning: boolean;
        addons: any[];
        selectedAddon: any;
        loadingStreams: boolean;
        streams: any[];
        metaData: ShowResponse | null;
        selectedEpisode: any;
        progressMap: ProgressMap | null;
        progressSignature?: string | number | null;
        onCloseStreamsPopup: () => void;
        onStreamClick: (stream: any) => void;
        onTorrentConfirm: () => void;
        onTorrentCancel: () => void;
    } = $props();
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
    onClose={onCloseStreamsPopup}
    onStreamClick={onStreamClick}
/>

{#if showTorrentWarning}
    <TorrentWarningModal
        onConfirm={onTorrentConfirm}
        onCancel={onTorrentCancel}
    />
{/if}
