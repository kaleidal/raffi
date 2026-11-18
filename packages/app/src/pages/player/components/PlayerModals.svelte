<script lang="ts">
    import TrackSelectionModal from "../../../components/player/TrackSelectionModal.svelte";
    import PlayerErrorModal from "../../../components/player/modals/PlayerErrorModal.svelte";

    export let showAudioSelection: boolean;
    export let showSubtitleSelection: boolean;
    export let showError: boolean;
    export let audioTracks: any[];
    export let subtitleTracks: any[];
    export let errorMessage: string;
    export let errorDetails: string;

    export let onAudioSelect: (detail: any) => void;
    export let onSubtitleSelect: (detail: any) => void;
    export let onSubtitleUpload: (file: File) => void | Promise<void> = () => {};
    export let onSubtitleDelayChange: (detail: { seconds: number }) => void = () => {};
    export let onErrorRetry: () => void;
    export let onErrorBack: () => void;
    export let onDownloadDesktop: () => void = () => {};
    export let onCloseAudio: () => void;
    export let onCloseSubtitle: () => void;

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

