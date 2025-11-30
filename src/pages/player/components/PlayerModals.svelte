<script lang="ts">
    import TrackSelectionModal from "../../../components/player/TrackSelectionModal.svelte";
    import PlayerErrorModal from "../../../components/player/modals/PlayerErrorModal.svelte";
    import WatchPartyModal from "../../../components/player/watch_party/WatchPartyModal.svelte";
    import type { ShowResponse } from "../../../lib/library/types/meta_types";

    export let showAudioSelection: boolean;
    export let showSubtitleSelection: boolean;
    export let showError: boolean;
    export let showWatchPartyModal: boolean;
    export let audioTracks: any[];
    export let subtitleTracks: any[];
    export let errorMessage: string;
    export let errorDetails: string;
    export let metaData: ShowResponse | null;
    export let season: number | null;
    export let episode: number | null;
    export let videoSrc: string | null;
    export let fileIdx: number | null;

    export let onAudioSelect: (detail: any) => void;
    export let onSubtitleSelect: (detail: any) => void;
    export let onErrorRetry: () => void;
    export let onErrorBack: () => void;
    export let onCloseAudio: () => void;
    export let onCloseSubtitle: () => void;
    export let onCloseWatchParty: () => void;
</script>

{#if showAudioSelection}
    <TrackSelectionModal
        title="Audio"
        tracks={audioTracks}
        on:select={(e) => onAudioSelect(e.detail)}
        on:close={onCloseAudio}
    />
{/if}

{#if showSubtitleSelection}
    <TrackSelectionModal
        title="Subtitles"
        tracks={subtitleTracks}
        on:select={(e) => onSubtitleSelect(e.detail)}
        on:close={onCloseSubtitle}
    />
{/if}

{#if showError}
    <PlayerErrorModal
        {errorMessage}
        {errorDetails}
        on:retry={onErrorRetry}
        on:back={onErrorBack}
    />
{/if}

{#if showWatchPartyModal}
    <WatchPartyModal
        imdbId={metaData?.meta.imdb_id || ""}
        {season}
        {episode}
        streamSource={videoSrc || ""}
        {fileIdx}
        onClose={onCloseWatchParty}
    />
{/if}
