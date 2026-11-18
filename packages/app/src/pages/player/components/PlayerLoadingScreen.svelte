<script lang="ts">
    import { fade, fly } from "svelte/transition";
    import { ChevronLeft, ExternalLink, MonitorDown } from "@lucide/svelte";
    import type { ShowResponse } from "../../../lib/library/types/meta_types";
    import { isWeb } from "../../../lib/shell/platform";
    import { fullscreenPortal } from "../../../components/common/portal";
    import LoadingSpinner from "../../../components/common/LoadingSpinner.svelte";
    import TitleLogo from "../../../components/common/TitleLogo.svelte";
    import { episodeLine } from "../../../components/player/chrome/episodeLine";
    import SeekStyleChoice from "./SeekStyleChoice.svelte";

    let {
        loading,
        onClose,
        metaData,
        season,
        episode,
        stage = "",
        details = "",
        progress = null,
        backdropSrc = null,
        backdropMode = "art",
        showError = false,
        errorMessage = "",
        errorDetails = "",
        onRetry,
        onBack,
        onDownloadDesktop = () => {},
        showNotice = false,
        noticeTitle = "",
        noticeDetails = "",
        noticePrimaryLabel = "Back to Streams",
        noticeSecondaryLabel = "",
        onNoticePrimary = () => {},
        onNoticeSecondary = () => {},
        showSeekStyle = false,
        seekBarStyle = "raffi",
        onSeekStyleChange = () => {},
        onSeekStyleAcknowledge = () => {},
    }: {
        loading: boolean;
        onClose: () => void;
        metaData: ShowResponse | null;
        season: number | null;
        episode: number | null;
        stage?: string;
        details?: string;
        progress?: number | null;
        backdropSrc?: string | null;
        backdropMode?: "art" | "frame";
        showError?: boolean;
        errorMessage?: string;
        errorDetails?: string;
        onRetry: () => void;
        onBack: () => void;
        onDownloadDesktop?: () => void;
        showNotice?: boolean;
        noticeTitle?: string;
        noticeDetails?: string;
        noticePrimaryLabel?: string;
        noticeSecondaryLabel?: string;
        onNoticePrimary?: () => void;
        onNoticeSecondary?: () => void;
        showSeekStyle?: boolean;
        seekBarStyle?: "raffi" | "normal";
        onSeekStyleChange?: (style: "raffi" | "normal") => void;
        onSeekStyleAcknowledge?: () => void;
    } = $props();

    let logoFailed = $state(false);

    const blocked = $derived(showError || showNotice || showSeekStyle);
    const resuming = $derived(backdropMode === "frame" && Boolean(backdropSrc) && !blocked);
    const backdrop = $derived(backdropSrc ?? metaData?.meta?.background ?? metaData?.meta?.poster ?? null);
    const fill = $derived(progress === null ? null : Math.max(0, Math.min(1, progress)));
    const line = $derived(episodeLine(metaData, season, episode));
    const label = $derived(
        showError ? errorMessage || "Playback error" : showNotice ? noticeTitle : showSeekStyle ? "Choose seek bar style" : stage || "Loading video",
    );

    const button = "flex cursor-pointer items-center justify-center gap-2 rounded-full px-7 py-3 text-[15px] font-semibold whitespace-nowrap transition-colors";
</script>

{#if loading || blocked}
    <div
        use:fullscreenPortal
        class="fixed inset-0 z-[200] overflow-hidden bg-canvas text-ink scheme-dark"
        role={showError ? "alert" : blocked ? "dialog" : "status"}
        aria-busy={!blocked}
        aria-label={label}
        transition:fade={{ duration: 280 }}
    >
        {#if backdrop}
            <img
                src={backdrop}
                alt=""
                class="backdrop absolute inset-0 h-full w-full object-cover transition-opacity duration-700"
                class:drift={!resuming}
                style="opacity: {resuming ? 0.9 : blocked ? 0.22 : 0.42}"
            />
        {/if}
        <div class="shade pointer-events-none absolute inset-0" class:shade--light={resuming}></div>

        <button
            class="chrome-back absolute z-10 flex cursor-pointer items-center justify-center rounded-full bg-ink/10 backdrop-blur-md transition-colors duration-200 hover:bg-ink/20"
            onclick={onClose}
            aria-label="Close player"
        >
            <ChevronLeft strokeWidth={2} />
        </button>

        {#if resuming}
            <div class="absolute right-0 bottom-0 p-[clamp(24px,3vw,48px)]">
                <LoadingSpinner size="44px" />
            </div>
        {:else}
            <div class="content absolute inset-x-0 bottom-0 flex max-w-[900px] flex-col items-start gap-[clamp(18px,1.8vw,30px)]">
                {#if metaData}
                    <TitleLogo
                        logo={logoFailed ? null : metaData.meta.logo}
                        name={metaData.meta.name}
                        progress={blocked ? null : fill}
                        pending={!blocked && !fill}
                        compact
                        onLogoError={() => (logoFailed = true)}
                    />
                {/if}

                {#if showError || showNotice}
                    <div class="flex max-w-xl flex-col items-start gap-5" in:fly={{ y: 10, duration: 320 }}>
                        <div>
                            <h1 class="text-[clamp(26px,2.2vw,38px)] leading-tight font-semibold text-balance">
                                {showNotice ? noticeTitle : errorMessage || "Playback stopped"}
                            </h1>
                            {#if showNotice ? noticeDetails : errorDetails}
                                <p class="mt-2 text-[clamp(14px,1vw,17px)] text-pretty text-ink/65">
                                    {showNotice ? noticeDetails : errorDetails}
                                </p>
                            {/if}
                        </div>
                        <div class="flex flex-wrap items-center gap-3">
                            <button class="{button} bg-accent text-on-accent hover:bg-accent/85" onclick={showNotice ? onNoticePrimary : onRetry}>
                                {showNotice ? noticePrimaryLabel : "Try Again"}
                            </button>
                            {#if !showNotice || noticeSecondaryLabel}
                                <button class="{button} bg-ink/10 text-ink hover:bg-ink/16" onclick={showNotice ? onNoticeSecondary : onBack}>
                                    {showNotice ? noticeSecondaryLabel : "Back to Streams"}
                                    {#if showNotice}<ExternalLink size={16} strokeWidth={2} />{/if}
                                </button>
                            {/if}
                            {#if showError && isWeb}
                                <button
                                    class="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium text-ink/60 transition-colors hover:text-ink"
                                    onclick={onDownloadDesktop}
                                >
                                    <MonitorDown size={17} strokeWidth={2} />
                                    Get the desktop app
                                </button>
                            {/if}
                        </div>
                    </div>
                {:else if showSeekStyle}
                    <SeekStyleChoice style={seekBarStyle} onChange={onSeekStyleChange} onContinue={onSeekStyleAcknowledge} />
                {:else}
                    <div class="flex flex-col gap-1.5" in:fade={{ duration: 200 }}>
                        {#if line}
                            <span class="text-[clamp(15px,1.1vw,20px)] font-medium whitespace-pre text-ink/85">{line}</span>
                        {/if}
                        <span class="text-[clamp(13px,0.9vw,16px)] text-ink/55">{stage || "Loading"}</span>
                    </div>
                {/if}
            </div>
        {/if}

        {#if details}
            <span class="sr-only">{details}</span>
        {/if}
    </div>
{/if}

<style>
    .chrome-back {
        top: clamp(18px, 2.6vw, 48px);
        left: clamp(20px, 3.4vw, 64px);
        width: clamp(44px, 3.2vw, 54px);
        height: clamp(44px, 3.2vw, 54px);
    }

    .chrome-back :global(svg) {
        width: clamp(21px, 1.55vw, 26px);
        height: clamp(21px, 1.55vw, 26px);
    }

    .content {
        padding: 0 clamp(20px, 3.4vw, 64px) clamp(40px, 9vh, 110px);
    }

    .shade {
        background:
            linear-gradient(to top, var(--raffi-canvas) 0%, color-mix(in oklab, var(--raffi-canvas) 70%, transparent) 30%, transparent 70%),
            linear-gradient(to right, color-mix(in oklab, var(--raffi-canvas) 60%, transparent), transparent 60%);
    }

    .shade--light {
        background: linear-gradient(to top, rgb(0 0 0 / 0.35), transparent 40%);
    }

    .drift {
        animation: drift 24s ease-out both;
    }

    @keyframes drift {
        from {
            scale: 1.02;
        }
        to {
            scale: 1.12;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .drift {
            animation: none;
        }
    }
</style>
