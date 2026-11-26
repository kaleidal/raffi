<script lang="ts">
    import TrackSelectionModal from "../../../components/player/TrackSelectionModal.svelte";
    import PlayerErrorModal from "../../../components/player/modals/PlayerErrorModal.svelte";

    let {
        showAudioSelection,
        showSubtitleSelection,
        showError,
        audioTracks,
        subtitleTracks,
        errorMessage,
        errorDetails,
        onAudioSelect,
        onSubtitleSelect,
        onSubtitleUpload,
        onSubtitleDelayChange,
        onErrorRetry,
        onErrorBack,
        onDownloadDesktop,
        onCloseAudio,
        onCloseSubtitle,
    }: {
        showAudioSelection: boolean;
        showSubtitleSelection: boolean;
        showError: boolean;
        audioTracks: any[];
        subtitleTracks: any[];
        errorMessage: string;
        errorDetails: string;
        onAudioSelect: (detail: any) => void;
        onSubtitleSelect: (detail: any) => void;
        onSubtitleUpload: (file: File) => void | Promise<void>;
        onSubtitleDelayChange: (detail: { seconds: number }) => void;
        onErrorRetry: () => void;
        onErrorBack: () => void;
        onDownloadDesktop: () => void;
        onCloseAudio: () => void;
        onCloseSubtitle: () => void;
    } = $props();
</script>

{#if showAudioSelection}
    <TrackSelectionModal
        title="Audio"
        tracks={audioTracks}
        onSelect={onAudioSelect}
        onClose={onCloseAudio}
    />
{/if}

{#if showSubtitleSelection}
    <TrackSelectionModal
        title="Subtitles"
        kind="subtitles"
        tracks={subtitleTracks}
        onSelect={onSubtitleSelect}
        onUpload={onSubtitleUpload}
        onDelayChange={onSubtitleDelayChange}
        onClose={onCloseSubtitle}
    />
{/if}

{#if showError}
    <PlayerErrorModal
        {errorMessage}
        {errorDetails}
        onRetry={onErrorRetry}
        onBack={onErrorBack}
        {onDownloadDesktop}
    />
{/if}

