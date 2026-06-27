<script lang="ts">
    import type {
        GuideGridRow,
        GuideGridViewport,
        GuideProgrammeState,
    } from "../../../lib/iptv/guideGrid";
    import type { IptvChannel } from "../../../lib/iptv/types";
    import { formatTime, type GuideTimeTick } from "../liveHelpers";
    import LiveChannelLogo from "./LiveChannelLogo.svelte";

    const GUIDE_TIMELINE_MIN_WIDTH = 680;

    export let guideTitle = "Live TV";
    export let guideViewport: GuideGridViewport;
    export let guideRows: GuideGridRow[] = [];
    export let guideTimeTicks: GuideTimeTick[] = [];
    export let guideNowLinePercent = 0;
    export let showGuideNowLine = false;
    export let hasGuide = false;
    export let hasMoreGuideChannels = false;
    export let visibleGuideChannelsCount = 0;
    export let visibleChannelsCount = 0;
    export let nextGuideChannelPageCount = 0;
    export let onPlayChannel: (channel: IptvChannel) => void = () => {};
    export let onShowMoreGuideChannels: () => void = () => {};

    let failedLogoUrls = new Set<string>();

    function shouldShowLogo(channel: IptvChannel) {
        return Boolean(channel.logo && !failedLogoUrls.has(channel.logo));
    }

    function markLogoFailed(logo: string | undefined) {
        if (!logo) return;
        failedLogoUrls = new Set(failedLogoUrls).add(logo);
    }

    function timeTickClass(leftPercent: number) {
        const base =
            "absolute top-1/2 -translate-y-1/2 whitespace-nowrap px-2 text-[11px] tabular-nums text-white/42";
        if (leftPercent <= 1) return `${base} translate-x-0`;
        if (leftPercent >= 99) return `${base} -translate-x-full`;
        return `${base} -translate-x-1/2`;
    }

    function programmeBlockClass(state: GuideProgrammeState) {
        if (state === "current") {
            return "border-white/18 bg-white/18 text-white shadow-[0_10px_24px_rgba(0,0,0,0.18)] hover:bg-white/24";
        }

        if (state === "future") {
            return "border-white/[0.08] bg-white/[0.08] text-white/84 hover:bg-white/[0.12]";
        }

        return "border-white/[0.06] bg-white/[0.04] text-white/46 hover:bg-white/[0.07]";
    }

    function guideFallbackLabel() {
        return "No guide data";
    }
</script>

<section class="overflow-hidden rounded-[28px] border border-white/10 bg-[#2b2b2b]/56 shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-xl">
    <div class="flex flex-col gap-2 border-b border-white/10 bg-white/[0.04] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
            <h2 class="font-poppins text-lg font-semibold">
                {guideTitle}
            </h2>
            <p class="text-sm text-white/45">
                Click a channel{#if hasGuide} or programme{/if} to start live playback.
                {#if hasMoreGuideChannels}
                    Showing {visibleGuideChannelsCount} of {visibleChannelsCount} matching channels.
                {/if}
            </p>
        </div>
        <div class="text-sm tabular-nums text-white/46">
            {#if hasGuide}
                {formatTime(guideViewport.viewportStart)} to {formatTime(
                    guideViewport.viewportEnd,
                )}
            {:else}
                {visibleChannelsCount} channels
            {/if}
        </div>
    </div>

    {#if !hasGuide}
        <div class="p-4">
            <div class="grid grid-cols-[repeat(auto-fill,minmax(86px,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(104px,1fr))]">
                {#each guideRows as row (row.channel.id)}
                    <button
                        class="flex h-[104px] min-w-0 flex-col items-center justify-center gap-2 rounded-2xl bg-white/[0.06] px-2 text-center transition-colors hover:bg-white/[0.11]"
                        title={row.channel.name}
                        aria-label={`Play ${row.channel.name}`}
                        onclick={() => onPlayChannel(row.channel)}
                    >
                        <LiveChannelLogo
                            channel={row.channel}
                            {shouldShowLogo}
                            {markLogoFailed}
                        />
                        <span class="line-clamp-2 max-w-full text-[11px] font-medium leading-tight text-white/72">
                            {row.channel.name}
                        </span>
                        {#if row.channel.number}
                            <span class="max-w-full truncate rounded bg-white/[0.07] px-1.5 py-0.5 text-[10px] tabular-nums text-white/54">
                                {row.channel.number}
                            </span>
                        {/if}
                    </button>
                {/each}
            </div>
        </div>
    {:else}
        <div class="grid grid-cols-[88px_minmax(0,1fr)] sm:grid-cols-[108px_minmax(0,1fr)]">
            <div class="border-r border-white/10 bg-black/18">
                <div class="h-10 border-b border-white/10 bg-white/[0.03]"></div>
                {#each guideRows as row (row.channel.id)}
                    <button
                        class="flex h-[86px] w-full flex-col items-center justify-center gap-1 border-b border-white/[0.06] px-2 text-center transition-colors hover:bg-white/[0.06]"
                        title={row.channel.name}
                        aria-label={`Play ${row.channel.name}`}
                        onclick={() => onPlayChannel(row.channel)}
                    >
                        <LiveChannelLogo
                            channel={row.channel}
                            {shouldShowLogo}
                            {markLogoFailed}
                        />
                        {#if row.channel.number}
                            <span class="max-w-full truncate rounded bg-white/[0.07] px-1.5 py-0.5 text-[10px] tabular-nums text-white/54">
                                {row.channel.number}
                            </span>
                        {:else}
                            <span class="max-w-full truncate text-[10px] leading-none text-white/48">
                                {row.channel.name}
                            </span>
                        {/if}
                    </button>
                {/each}
            </div>

            <div class="no-scrollbar min-w-0 overflow-x-auto bg-black/12">
                <div class="relative" style={`min-width: ${GUIDE_TIMELINE_MIN_WIDTH}px;`}>
                    <div class="relative h-10 border-b border-white/10 bg-white/[0.03]">
                        {#each guideTimeTicks as tick (tick.value.getTime())}
                            <div
                                class={timeTickClass(tick.leftPercent)}
                                style={`left: ${tick.leftPercent}%;`}
                            >
                                {tick.label}
                            </div>
                        {/each}
                    </div>

                    <div class="relative">
                        {#if showGuideNowLine}
                            <div
                                class="pointer-events-none absolute bottom-0 top-0 z-30 w-px -translate-x-1/2"
                                style={`left: ${guideNowLinePercent}%;`}
                            >
                                <div class="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_16px_rgba(255,255,255,0.55)]"></div>
                                <div class="h-full w-px bg-white/80 shadow-[0_0_12px_rgba(255,255,255,0.28)]"></div>
                            </div>
                        {/if}

                        {#each guideRows as row (row.channel.id)}
                            <div class="relative h-[86px] border-b border-white/[0.06]">
                                {#if row.programmes.length > 0}
                                    {#each row.programmes as programme (programme.id)}
                                        <button
                                            class={`absolute inset-y-2 overflow-hidden rounded-xl border px-3 py-2 text-left transition-colors ${programmeBlockClass(programme.state)}`}
                                            style={`left: ${programme.leftPercent}%; width: ${programme.widthPercent}%;`}
                                            title={`${programme.timeRange} ${programme.title}`}
                                            onclick={() => onPlayChannel(row.channel)}
                                        >
                                            <span class="line-clamp-2 font-poppins text-[13px] font-semibold leading-tight">
                                                {programme.title}
                                            </span>
                                            <span class="mt-1 block truncate text-[11px] tabular-nums opacity-68">
                                                {programme.timeRange}
                                            </span>
                                        </button>
                                    {/each}
                                {:else}
                                    <button
                                        class="absolute inset-y-2 left-2 right-2 flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.08] px-3 text-left text-white/78 transition-colors hover:bg-white/[0.12]"
                                        onclick={() => onPlayChannel(row.channel)}
                                    >
                                        <span class="font-poppins text-[13px] font-semibold">
                                            {guideFallbackLabel()}
                                        </span>
                                        <span class="min-w-0 truncate text-[11px] text-white/42">
                                            {row.channel.name}
                                        </span>
                                    </button>
                                {/if}
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
        </div>
    {/if}

    {#if hasMoreGuideChannels}
        <div class="flex flex-col gap-3 border-t border-white/10 bg-white/[0.03] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p class="text-sm leading-6 text-white/48">
                Large playlists are paged to keep the guide responsive. Search or select a group to narrow the list.
            </p>
            <button
                class="h-11 rounded-full border border-white/10 bg-white/8 px-5 text-sm font-semibold text-white/76 transition-colors hover:bg-white/14 hover:text-white"
                onclick={onShowMoreGuideChannels}
            >
                Show {nextGuideChannelPageCount} more
            </button>
        </div>
    {/if}
</section>

<style>
    .no-scrollbar::-webkit-scrollbar {
        display: none;
    }

    .no-scrollbar {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
</style>
