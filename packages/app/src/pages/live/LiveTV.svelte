<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import SearchBar from "../../components/home/SearchBar.svelte";
    import SettingsModal from "../../components/home/modals/SettingsModal.svelte";
    import { trackEvent } from "../../lib/analytics";
    import {
        getStoredIptvRefreshResult,
        persistIptvRefreshResult,
    } from "../../lib/iptv/cache";
    import {
        buildGuideRows,
        getNowLinePercent,
    } from "../../lib/iptv/guideGrid";
    import { refreshIptvSource } from "../../lib/iptv/refresh";
    import {
        getStoredIptvSources,
        iptvSources,
    } from "../../lib/iptv/store";
    import type {
        IptvChannel,
        IptvRefreshResult,
        IptvSource,
    } from "../../lib/iptv/types";
    import { getNowNext } from "../../lib/iptv/xmltv";
    import { router } from "../../lib/stores/router";
    import LiveEmptyState from "./components/LiveEmptyState.svelte";
    import LiveGroupFilter from "./components/LiveGroupFilter.svelte";
    import LiveGuide from "./components/LiveGuide.svelte";
    import LiveSourceManager from "./components/LiveSourceManager.svelte";
    import LiveSourceSelector from "./components/LiveSourceSelector.svelte";
    import {
        ALL_GROUPS,
        GUIDE_CHANNEL_PAGE_SIZE,
        GUIDE_INITIAL_CHANNEL_LIMIT,
        LIVE_TV_AUTO_REFRESH_RETRY_MS,
        LIVE_TV_REFRESH_CHECK_INTERVAL_MS,
        buildGuideTimeTicks,
        formatLoadedAt,
        getGuideViewport,
        getLiveSourceCacheKey,
        getLiveSourceSummary,
        getStoredLiveTvGroup,
        getStoredLiveTvSelection,
        getVisibleChannels,
        setStoredLiveTvGroup,
        setStoredLiveTvSourceId,
        shouldAutoRefreshLiveTvSource,
    } from "./liveHelpers";

    const IPTV_EXAMPLE_M3U_URL = (
        import.meta.env.VITE_RAFFI_IPTV_EXAMPLE_M3U_URL as string | undefined
    )?.trim();
    const IPTV_EXAMPLE_EPG_URL = (
        import.meta.env.VITE_RAFFI_IPTV_EXAMPLE_EPG_URL as string | undefined
    )?.trim();
    const IPTV_EXAMPLE =
        IPTV_EXAMPLE_M3U_URL && IPTV_EXAMPLE_EPG_URL
            ? {
                  name: "IPTV Example",
                  m3uUrl: IPTV_EXAMPLE_M3U_URL,
                  epgUrl: IPTV_EXAMPLE_EPG_URL,
              }
            : null;

    const isDev = import.meta.env.DEV;

    function getInitialLiveTvState() {
        const storedSelection = getStoredLiveTvSelection();
        const storedSources = getStoredIptvSources();
        const source =
            storedSources.find((candidate) => candidate.id === storedSelection.sourceId) ??
            storedSources[0] ??
            null;
        const cacheKey = source ? getLiveSourceCacheKey(source) : "";
        const cachedResult = source ? getStoredIptvRefreshResult(source) : null;

        return {
            selectedSourceId: source?.id ?? storedSelection.sourceId,
            loadedSourceId: source ? source.id : "",
            loadedSourceCacheKey: source ? cacheKey : "",
            refreshResult: cachedResult,
            selectedGroup: source ? getStoredLiveTvGroup(source.id) || ALL_GROUPS : ALL_GROUPS,
        };
    }

    const initialLiveTvState = getInitialLiveTvState();

    let selectedSourceId = initialLiveTvState.selectedSourceId;
    let loadedSourceId = initialLiveTvState.loadedSourceId;
    let loadedSourceCacheKey = initialLiveTvState.loadedSourceCacheKey;
    let refreshResult: IptvRefreshResult | null = initialLiveTvState.refreshResult;
    let refreshing = false;
    let refreshError = "";
    let selectedGroup = initialLiveTvState.selectedGroup;
    let searchQuery = "";
    let guideNow = new Date();
    let guideTimer: ReturnType<typeof setInterval> | null = null;
    let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;
    let lastAutoRefreshAttemptKey = "";
    let lastAutoRefreshAttemptAt = 0;
    let showSourceManager = false;
    let sourceManagerResetRequest = 0;
    let showSettingsModal = false;
    let guideChannelLimit = GUIDE_INITIAL_CHANNEL_LIMIT;
    let guideChannelFilterKey = "";

    $: selectedSource =
        $iptvSources.find((source) => source.id === selectedSourceId) ?? null;
    $: selectedSourceCacheKey = selectedSource
        ? getLiveSourceCacheKey(selectedSource)
        : "";
    $: currentResult =
        refreshResult &&
        loadedSourceId === selectedSourceId &&
        loadedSourceCacheKey === selectedSourceCacheKey
            ? refreshResult
            : null;
    $: availableGroups = currentResult?.groups ?? [];
    $: sourceSummary = getLiveSourceSummary(currentResult, selectedSource);
    $: sourceRefreshedLabel = currentResult
        ? `Refreshed ${formatLoadedAt(currentResult.loadedAt)}`
        : "";
    $: visibleChannels = getVisibleChannels(
        currentResult?.channels ?? [],
        selectedGroup,
        searchQuery,
    );
    $: currentGuideChannelFilterKey = `${selectedSourceId}\n${selectedGroup}\n${searchQuery.trim()}`;
    $: if (guideChannelFilterKey !== currentGuideChannelFilterKey) {
        guideChannelFilterKey = currentGuideChannelFilterKey;
        guideChannelLimit = GUIDE_INITIAL_CHANNEL_LIMIT;
    }
    $: visibleGuideChannels = visibleChannels.slice(0, guideChannelLimit);
    $: hasMoreGuideChannels = visibleGuideChannels.length < visibleChannels.length;
    $: remainingGuideChannels = Math.max(
        visibleChannels.length - visibleGuideChannels.length,
        0,
    );
    $: nextGuideChannelPageCount = Math.min(
        GUIDE_CHANNEL_PAGE_SIZE,
        remainingGuideChannels,
    );
    $: guideTitle = selectedGroup === ALL_GROUPS ? "Live TV" : selectedGroup;
    $: guideViewport = getGuideViewport(guideNow);
    $: guideRows = currentResult
        ? buildGuideRows(visibleGuideChannels, currentResult.guide, guideViewport)
        : [];
    $: guideNowLinePercent = getNowLinePercent(guideViewport);
    $: showGuideNowLine = guideNowLinePercent >= 0 && guideNowLinePercent <= 100;
    $: guideTimeTicks = buildGuideTimeTicks(guideViewport);
    $: if (!selectedSourceId && $iptvSources.length > 0) {
        selectedSourceId = $iptvSources[0].id;
    }
    $: if (
        selectedSourceId &&
        !$iptvSources.some((source) => source.id === selectedSourceId)
    ) {
        selectedSourceId = $iptvSources[0]?.id ?? "";
    }
    $: if (selectedSource) {
        setStoredLiveTvSourceId(selectedSource.id);
    }
    $: if (
        selectedSource &&
        (loadedSourceId !== selectedSource.id ||
            loadedSourceCacheKey !== selectedSourceCacheKey)
    ) {
        hydrateStoredSource(selectedSource, selectedSourceCacheKey);
    }
    $: if (!selectedSource && refreshResult) {
        loadedSourceId = "";
        loadedSourceCacheKey = "";
        refreshResult = null;
    }
    $: if (
        currentResult &&
        selectedGroup !== ALL_GROUPS &&
        !availableGroups.some((group) => group.name === selectedGroup)
    ) {
        selectedGroup = ALL_GROUPS;
    }
    $: if (selectedSource && currentResult) {
        setStoredLiveTvGroup(selectedSource.id, selectedGroup);
    }

    function showMoreGuideChannels() {
        guideChannelLimit = Math.min(
            visibleChannels.length,
            guideChannelLimit + GUIDE_CHANNEL_PAGE_SIZE,
        );
    }

    function hydrateStoredSource(source: IptvSource, cacheKey: string) {
        const cachedResult = getStoredIptvRefreshResult(source);
        refreshResult = cachedResult;
        loadedSourceId = source.id;
        loadedSourceCacheKey = cacheKey;
        selectedGroup = getStoredLiveTvGroup(source.id) || ALL_GROUPS;
        searchQuery = "";
        refreshError = "";
        queueMicrotask(() => {
            maybeAutoRefreshSelectedSource();
        });
    }

    function openSourceManager() {
        showSourceManager = true;
    }

    function openCreateSourceManager() {
        sourceManagerResetRequest += 1;
        showSourceManager = true;
    }

    function handleSourceRemoved(source: IptvSource) {
        if (loadedSourceId === source.id) {
            loadedSourceId = "";
            loadedSourceCacheKey = "";
            refreshResult = null;
        }
    }

    async function refreshSelectedSource(refreshReason: "manual" | "auto" = "manual") {
        if (!selectedSource) {
            refreshError = "No IPTV source configured";
            return;
        }

        const source = selectedSource;
        const sourceCacheKey = selectedSourceCacheKey;
        const hadUsableResult = Boolean(currentResult);
        refreshing = true;
        if (refreshReason === "manual" || !hadUsableResult) {
            refreshError = "";
        }

        try {
            const result = await refreshIptvSource(source);
            persistIptvRefreshResult(source, result);
            refreshResult = result;
            loadedSourceId = source.id;
            loadedSourceCacheKey = sourceCacheKey;
            lastAutoRefreshAttemptKey = "";
            lastAutoRefreshAttemptAt = 0;
            trackEvent(refreshReason === "auto" ? "iptv_source_auto_refreshed" : "iptv_source_refreshed", {
                channel_count: result.stats.channelCount,
                group_count: result.stats.groupCount,
                programme_count: result.stats.programmeCount,
                has_epg: Boolean(result.guide),
            });
        } catch (error) {
            if (refreshReason === "manual" || !hadUsableResult) {
                refreshError = error instanceof Error ? error.message : String(error);
            }
            trackEvent(refreshReason === "auto" ? "iptv_source_auto_refresh_failed" : "iptv_source_refresh_failed", {
                error_name: error instanceof Error ? error.name : "unknown",
            });
        } finally {
            refreshing = false;
        }
    }

    function maybeAutoRefreshSelectedSource() {
        if (!selectedSource || refreshing) return;
        if (!shouldAutoRefreshLiveTvSource(selectedSource, currentResult)) return;

        const now = Date.now();
        const attemptKey = `${selectedSourceCacheKey}\n${currentResult?.loadedAt ?? "missing"}`;
        if (
            lastAutoRefreshAttemptKey === attemptKey &&
            now - lastAutoRefreshAttemptAt < LIVE_TV_AUTO_REFRESH_RETRY_MS
        ) {
            return;
        }

        lastAutoRefreshAttemptKey = attemptKey;
        lastAutoRefreshAttemptAt = now;
        void refreshSelectedSource("auto");
    }

    function getChannelGuide(channel: IptvChannel) {
        if (!currentResult?.guide) return { now: null, next: null };
        return getNowNext(channel, currentResult.guide, guideNow);
    }

    function playChannel(channel: IptvChannel) {
        const nowNext = getChannelGuide(channel);
        trackEvent("live_channel_opened", {
            group: channel.group,
            has_logo: Boolean(channel.logo),
            has_programme: Boolean(nowNext.now),
        });
        router.navigate("player", {
            videoSrc: channel.url,
            startTime: 0,
            metaData: null,
            fileIdx: null,
            season: null,
            episode: null,
            liveMode: true,
            liveChannel: {
                name: channel.name,
                group: channel.group,
                logo: channel.logo ?? null,
                tvgId: channel.tvgId ?? null,
                programmeTitle: nowNext.now?.title ?? null,
            },
        });
    }

    onMount(() => {
        guideTimer = setInterval(() => {
            guideNow = new Date();
        }, 60_000);

        autoRefreshTimer = setInterval(() => {
            maybeAutoRefreshSelectedSource();
        }, LIVE_TV_REFRESH_CHECK_INTERVAL_MS);

        void tick().then(() => {
            if (selectedSource) {
                const sourceCacheKey = selectedSourceCacheKey;
                if (loadedSourceId !== selectedSource.id || loadedSourceCacheKey !== sourceCacheKey) {
                    hydrateStoredSource(selectedSource, sourceCacheKey);
                }
            }
            maybeAutoRefreshSelectedSource();
        });
    });

    onDestroy(() => {
        if (guideTimer) {
            clearInterval(guideTimer);
        }
        if (autoRefreshTimer) {
            clearInterval(autoRefreshTimer);
        }
    });
</script>

<SettingsModal bind:showSettings={showSettingsModal} />
<LiveSourceManager
    bind:show={showSourceManager}
    bind:selectedSourceId
    resetRequest={sourceManagerResetRequest}
    {isDev}
    iptvExample={IPTV_EXAMPLE}
    onSourceRemoved={handleSourceRemoved}
/>

<div class="flex h-full min-h-screen w-full flex-col overflow-hidden bg-[#090909] text-white">
    <SearchBar
        absolute={false}
        controlledSearch={true}
        bind:searchValue={searchQuery}
        searchPlaceholder="search channels"
        searchDisabled={!currentResult}
        searchWidthClass="w-[420px] max-w-[32vw]"
        showPlayButton={false}
        showAddonsButton={false}
        showLiveTvButton={false}
        onOpenSettings={() => (showSettingsModal = true)}
    >
        <svelte:fragment slot="prefix">
            <LiveSourceSelector
                sources={$iptvSources}
                bind:selectedSourceId
                {sourceSummary}
                refreshedLabel={sourceRefreshedLabel}
                {refreshing}
                onManage={openSourceManager}
                onRefresh={refreshSelectedSource}
            />
            <LiveGroupFilter
                groups={availableGroups}
                bind:selectedGroup
                allGroupsValue={ALL_GROUPS}
                disabled={!currentResult}
                totalChannels={currentResult?.stats.channelCount ?? 0}
            />
        </svelte:fragment>
    </SearchBar>

    <main class="relative z-10 min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-2 lg:px-8 lg:pt-4">
        <div class="mx-auto flex w-full max-w-[1760px] flex-col gap-4">
            {#if refreshError}
                <div class="rounded-[20px] border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {refreshError}
                </div>
            {/if}

            {#if refreshing && !currentResult}
                <LiveEmptyState state="refreshing" />
            {:else if !selectedSource}
                <LiveEmptyState state="no-source" onAddSource={openCreateSourceManager} />
            {:else if !currentResult}
                <LiveEmptyState
                    state="needs-refresh"
                    sourceName={selectedSource.name}
                    onRefreshSource={refreshSelectedSource}
                    onManageSources={openSourceManager}
                />
            {:else if visibleChannels.length === 0}
                <LiveEmptyState state="no-results" />
            {:else}
                <LiveGuide
                    {guideTitle}
                    {guideViewport}
                    {guideRows}
                    {guideTimeTicks}
                    {guideNowLinePercent}
                    {showGuideNowLine}
                    hasGuide={Boolean(currentResult.guide)}
                    {hasMoreGuideChannels}
                    visibleGuideChannelsCount={visibleGuideChannels.length}
                    visibleChannelsCount={visibleChannels.length}
                    {nextGuideChannelPageCount}
                    onPlayChannel={playChannel}
                    onShowMoreGuideChannels={showMoreGuideChannels}
                />
            {/if}
        </div>
    </main>
</div>
