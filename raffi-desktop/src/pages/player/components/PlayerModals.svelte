<script lang="ts">
    import TrackSelectionModal from "../../../components/player/TrackSelectionModal.svelte";
    import PlayerErrorModal from "../../../components/player/modals/PlayerErrorModal.svelte";
    import SeekStyleInfoModal from "../../../components/player/modals/SeekStyleInfoModal.svelte";
    import WatchPartyModal from "../../../components/player/watch_party/WatchPartyModal.svelte";
    import type { ShowResponse } from "../../../lib/library/types/meta_types";

    export let showAudioSelection: boolean;
    export let showSubtitleSelection: boolean;
    export let showError: boolean;
    export let showWatchPartyModal: boolean;
    export let showSeekStyleModal: boolean = false;
    export let audioTracks: any[];
    export let subtitleTracks: any[];
    export let errorMessage: string;
    export let errorDetails: string;
    export let seekBarStyle: "raffi" | "normal" = "raffi";
    export let metaData: ShowResponse | null;
    export let season: number | null;
    export let episode: number | null;
    export let videoSrc: string | null;
    export let fileIdx: number | null;
    export let initialPartyCode: string | null = null;
    export let autoJoin: boolean = false;
    export let onFileSelected: (file: any) => void = () => {};

    export let onAudioSelect: (detail: any) => void;
    export let onSubtitleSelect: (detail: any) => void;
    export let onSubtitleDelayChange: (detail: { seconds: number }) => void = () => {};
    export let onAddLocalSubtitle: (detail: any) => void = () => {};
    export let onErrorRetry: () => void;
    export let onErrorBack: () => void;
    export let onCloseAudio: () => void;
    export let onCloseSubtitle: () => void;
    export let onCloseWatchParty: () => void;

    export let onSeekStyleAcknowledge: () => void = () => {};
    export let onSeekStyleChange: (style: "raffi" | "normal") => void = () => {};
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
        kind="subtitles"
        tracks={subtitleTracks}
        on:select={(e) => onSubtitleSelect(e.detail)}
        on:delayChange={(e) => onSubtitleDelayChange(e.detail)}
        on:addLocalSubtitle={(e) => onAddLocalSubtitle(e.detail)}
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

{#if showSeekStyleModal}
    <SeekStyleInfoModal
        {seekBarStyle}
        on:styleChange={(e) => onSeekStyleChange(e.detail.style)}
        on:acknowledge={onSeekStyleAcknowledge}
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
        {initialPartyCode}
        {autoJoin}
        {onFileSelected}
    />
{/if}
