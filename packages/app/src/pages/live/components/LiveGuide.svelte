<script lang="ts">
    import type {
        GuideGridRow,
        GuideProgrammeState,
    } from "../../../lib/iptv/guideGrid";
    import type { IptvChannel } from "../../../lib/iptv/types";
    import type { GuideTimeTick } from "../liveHelpers";
    import LiveChannelContextMenu from "./LiveChannelContextMenu.svelte";
    import LiveChannelLogo from "./LiveChannelLogo.svelte";

    const GUIDE_TIMELINE_MIN_WIDTH = 680;

    export let guideRows: GuideGridRow[] = [];
    export let guideTimeTicks: GuideTimeTick[] = [];
    export let guideNowLinePercent = 0;
    export let showGuideNowLine = false;
    export let hasGuide = false;
    export let favoriteChannelIds: string[] = [];
    export let activeChannelId = "";
    export let hasMoreGuideChannels = false;
    export let onPlayChannel: (channel: IptvChannel) => void = () => {};
    export let onToggleFavoriteChannel: (channel: IptvChannel) => void = () => {};
    export let onShowMoreGuideChannels: () => void = () => {};

    let failedLogoUrls = new Set<string>();
    let contextMenuChannel: IptvChannel | null = null;
    let contextMenuTrigger: HTMLElement | null = null;
    let contextMenuX = 0;
    let contextMenuY = 0;

    $: favoriteChannelIdSet = new Set(favoriteChannelIds);

    function isFavoriteChannel(channel: IptvChannel) {
        return favoriteChannelIdSet.has(channel.id);
    }

    function openChannelContextMenu(event: MouseEvent, channel: IptvChannel) {
        event.preventDefault();
        event.stopPropagation();
        const rect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect();
        const hasPointerCoordinates = event.clientX !== 0 || event.clientY !== 0;
        contextMenuX = hasPointerCoordinates
            ? event.clientX
            : (rect?.left ?? 0) + Math.min(rect?.width ?? 0, 28);
        contextMenuY = hasPointerCoordinates
            ? event.clientY
            : (rect?.top ?? 0) + Math.min(rect?.height ?? 0, 28);
        contextMenuChannel = channel;
        contextMenuTrigger = event.currentTarget as HTMLElement | null;
    }

    function closeChannelContextMenu() {
        contextMenuChannel = null;
        contextMenuTrigger = null;
    }

    function toggleContextMenuFavorite() {
        if (!contextMenuChannel) return;
        onToggleFavoriteChannel(contextMenuChannel);
    }

    function loadMoreSentinel(node: HTMLElement, _pageKey: number = 0) {
        let disposed = false;
        const loadNextPage = () => {
            if (!disposed) onShowMoreGuideChannels();
        };

        if (typeof IntersectionObserver === "undefined") {
            queueMicrotask(loadNextPage);
            return {
                update() {
                    queueMicrotask(loadNextPage);
                },
                destroy() {
                    disposed = true;
                },
            };
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    loadNextPage();
                }
            },
            { rootMargin: "520px 0px" },
        );
        const observe = () => {
            observer.unobserve(node);
            observer.observe(node);
        };
        observe();

        return {
            update() {
                observe();
            },
            destroy() {
                disposed = true;
                observer.disconnect();
            },
        };
    }

    function channelButtonClass(channel: IptvChannel, variant: "grid" | "guide") {
        const active = channel.id === activeChannelId;
        const base =
            variant === "grid"
                ? "flex h-[88px] w-full min-w-0 items-center gap-3 rounded-[14px] border px-3 text-left transition-colors"
                : "flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center transition-colors";
        return active
            ? `${base} border-white/22 bg-white/[0.14] ring-1 ring-white/22`
            : `${base} border-white/[0.08] bg-white/[0.045] hover:border-white/14 hover:bg-white/[0.08]`;
    }

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

<section class="min-w-0">
    {#if !hasGuide}
        <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
            {#each guideRows as row (row.channel.id)}
                <button
                    class={channelButtonClass(row.channel, "grid")}
                    title={row.channel.name}
                    aria-label={`Play ${row.channel.name}`}
                    onclick={() => onPlayChannel(row.channel)}
                    oncontextmenu={(event) => openChannelContextMenu(event, row.channel)}
                >
                    <LiveChannelLogo
                        channel={row.channel}
                        {shouldShowLogo}
                        {markLogoFailed}
                    />
                    <span class="min-w-0 flex-1">
                        <span class="block truncate font-poppins text-sm font-semibold text-white/86">
                            {row.channel.name}
                        </span>
                        <span class="mt-1 flex min-w-0 items-center gap-2 text-xs text-white/48">
                            {#if row.channel.number}
                                <span class="shrink-0 rounded bg-white/[0.07] px-2 py-0.5 tabular-nums text-white/58">
                                    {row.channel.number}
                                </span>
                            {/if}
                            {#if row.channel.group || !row.channel.number}
                                <span class="truncate">
                                    {row.channel.group || "Live TV"}
                                </span>
                            {/if}
                        </span>
                    </span>
                </button>
            {/each}
        </div>
    {:else}
        <div class="grid grid-cols-[88px_minmax(0,1fr)] border-t border-white/10 sm:grid-cols-[108px_minmax(0,1fr)]">
            <div class="border-r border-white/10">
                <div class="h-10 border-b border-white/10 bg-white/[0.025]"></div>
                {#each guideRows as row (row.channel.id)}
                    <div class="h-[86px] border-b border-white/[0.06]">
                        <button
                            class={channelButtonClass(row.channel, "guide")}
                            title={row.channel.name}
                            aria-label={`Play ${row.channel.name}`}
                            onclick={() => onPlayChannel(row.channel)}
                            oncontextmenu={(event) => openChannelContextMenu(event, row.channel)}
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
                    </div>
                {/each}
            </div>

            <div class="no-scrollbar min-w-0 overflow-x-auto">
                <div class="relative" style={`min-width: ${GUIDE_TIMELINE_MIN_WIDTH}px;`}>
                    <div class="relative h-10 border-b border-white/10 bg-white/[0.025]">
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
                            <div
                                class="relative h-[86px] border-b border-white/[0.06]"
                                role="presentation"
                                oncontextmenu={(event) => openChannelContextMenu(event, row.channel)}
                            >
                                {#if row.programmes.length > 0}
                                    {#each row.programmes as programme (programme.id)}
                                        <button
                                            class={`absolute inset-y-2 overflow-hidden rounded-xl border px-3 py-2 text-left transition-colors ${programmeBlockClass(programme.state)}`}
                                            style={`left: ${programme.leftPercent}%; width: ${programme.widthPercent}%;`}
                                            title={`${programme.timeRange} ${programme.title}`}
                                            onclick={() => onPlayChannel(row.channel)}
                                            oncontextmenu={(event) => openChannelContextMenu(event, row.channel)}
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
                                        oncontextmenu={(event) => openChannelContextMenu(event, row.channel)}
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
        <div use:loadMoreSentinel={guideRows.length} class="h-px w-full" aria-hidden="true"></div>
    {/if}

    {#if contextMenuChannel}
        <LiveChannelContextMenu
            x={contextMenuX}
            y={contextMenuY}
            isFavorite={isFavoriteChannel(contextMenuChannel)}
            ariaLabel={`Channel actions for ${contextMenuChannel.name}`}
            returnFocusTo={contextMenuTrigger}
            onClose={closeChannelContextMenu}
            onToggleFavorite={toggleContextMenuFavorite}
        />
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
