<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import {
        ChevronLeft,
        Pencil,
        Plus,
        RefreshCw,
        Search,
        Trash2,
        Tv,
        X,
    } from "@lucide/svelte";
    import LoadingSpinner from "../../components/common/LoadingSpinner.svelte";
    import { trackEvent } from "../../lib/analytics";
    import { router } from "../../lib/stores/router";
    import {
        addIptvSource,
        iptvSources,
        removeIptvSource,
        updateIptvSource,
    } from "../../lib/iptv/store";
    import { refreshIptvSource } from "../../lib/iptv/refresh";
    import {
        getStoredIptvRefreshResult,
        getIptvSourceCacheFingerprint,
        persistIptvRefreshResult,
    } from "../../lib/iptv/cache";
    import {
        buildGuideRows,
        getNowLinePercent,
        type GuideGridViewport,
        type GuideProgrammeState,
    } from "../../lib/iptv/guideGrid";
    import { getNowNext } from "../../lib/iptv/xmltv";
    import type {
        IptvChannel,
        IptvRefreshResult,
        IptvSource,
        IptvSourceKind,
    } from "../../lib/iptv/types";

    const ALL_GROUPS = "__all__";
    const GUIDE_VIEWPORT_HOURS = 2;
    const GUIDE_TIMELINE_MIN_WIDTH = 680;
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

    let selectedSourceId = "";
    let loadedSourceId = "";
    let loadedSourceCacheKey = "";
    let refreshResult: IptvRefreshResult | null = null;
    let refreshing = false;
    let refreshError = "";
    let formError = "";
    let editingSourceId: string | null = null;
    let formKind: IptvSourceKind = "m3u";
    let formName = "";
    let formM3uUrl = "";
    let formEpgUrl = "";
    let formXtreamServerUrl = "";
    let formXtreamUsername = "";
    let formXtreamCredential = "";
    let selectedGroup = ALL_GROUPS;
    let searchQuery = "";
    let guideNow = new Date();
    let guideTimer: ReturnType<typeof setInterval> | null = null;
    let showSourceManager = false;

    const isDev = import.meta.env.DEV;

    $: selectedSource =
        $iptvSources.find((source) => source.id === selectedSourceId) ?? null;
    $: selectedSourceCacheKey = selectedSource ? getLiveSourceCacheKey(selectedSource) : "";
    $: currentResult =
        refreshResult &&
        loadedSourceId === selectedSourceId &&
        loadedSourceCacheKey === selectedSourceCacheKey
            ? refreshResult
            : null;
    $: availableGroups = currentResult?.groups ?? [];
    $: sourceSummary = currentResult
        ? `${currentResult.stats.channelCount} channels / ${currentResult.stats.groupCount} groups`
        : selectedSource
            ? "Refresh this source to load channels"
            : "Add a source to start watching";
    $: visibleChannels = getVisibleChannels(
        currentResult?.channels ?? [],
        selectedGroup,
        searchQuery,
    );
    $: guideTitle = selectedGroup === ALL_GROUPS ? "Live TV" : selectedGroup;
    $: guideViewport = getGuideViewport(guideNow);
    $: guideRows = currentResult
        ? buildGuideRows(visibleChannels, currentResult.guide, guideViewport)
        : [];
    $: guideNowLinePercent = getNowLinePercent(guideViewport);
    $: showGuideNowLine = guideNowLinePercent >= 0 && guideNowLinePercent <= 100;
    $: guideTimeTicks = buildGuideTimeTicks(guideViewport);
    $: if (!selectedSourceId && $iptvSources.length > 0) {
        selectedSourceId = $iptvSources[0].id;
    }
    $: if (selectedSourceId && !$iptvSources.some((source) => source.id === selectedSourceId)) {
        selectedSourceId = $iptvSources[0]?.id ?? "";
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
        selectedGroup !== ALL_GROUPS &&
        !availableGroups.some((group) => group.name === selectedGroup)
    ) {
        selectedGroup = ALL_GROUPS;
    }

    function getVisibleChannels(
        channels: IptvChannel[],
        group: string,
        query: string,
    ) {
        const normalizedQuery = query.trim().toLowerCase();
        return channels.filter((channel) => {
            if (group !== ALL_GROUPS && channel.group !== group) return false;
            if (!normalizedQuery) return true;

            return (
                channel.name.toLowerCase().includes(normalizedQuery) ||
                channel.group.toLowerCase().includes(normalizedQuery) ||
                (channel.tvgName ?? "").toLowerCase().includes(normalizedQuery) ||
                (channel.tvgId ?? "").toLowerCase().includes(normalizedQuery)
            );
        });
    }

    function getLiveSourceCacheKey(source: IptvSource) {
        return `${source.id}\n${getIptvSourceCacheFingerprint(source)}`;
    }

    function getGuideViewport(now: Date): GuideGridViewport {
        const viewportStart = new Date(now);
        viewportStart.setMinutes(0, 0, 0);

        return {
            viewportStart,
            viewportEnd: new Date(viewportStart.getTime() + GUIDE_VIEWPORT_HOURS * 60 * 60_000),
            now,
        };
    }

    function getTimePercent(value: Date, viewport: GuideGridViewport) {
        const viewportStartMs = viewport.viewportStart.getTime();
        const viewportDurationMs = viewport.viewportEnd.getTime() - viewportStartMs;

        if (viewportDurationMs <= 0) return 0;

        return ((value.getTime() - viewportStartMs) / viewportDurationMs) * 100;
    }

    function buildGuideTimeTicks(viewport: GuideGridViewport) {
        const ticks: { value: Date; label: string; leftPercent: number }[] = [];
        const tickMs = 30 * 60_000;

        for (
            let timestamp = viewport.viewportStart.getTime();
            timestamp <= viewport.viewportEnd.getTime();
            timestamp += tickMs
        ) {
            const value = new Date(timestamp);
            ticks.push({
                value,
                label: formatTime(value),
                leftPercent: getTimePercent(value, viewport),
            });
        }

        return ticks;
    }

    function timeTickClass(leftPercent: number) {
        const base = "absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] tabular-nums text-white/42";
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

    function guideFallbackLabel(hasGuide: boolean) {
        return hasGuide ? "No guide data" : "Live";
    }

    function hydrateStoredSource(source: IptvSource, cacheKey: string) {
        refreshResult = getStoredIptvRefreshResult(source);
        loadedSourceId = source.id;
        loadedSourceCacheKey = cacheKey;
        selectedGroup = ALL_GROUPS;
        refreshError = "";
    }

    function resetForm() {
        editingSourceId = null;
        formKind = "m3u";
        formName = "";
        formM3uUrl = "";
        formEpgUrl = "";
        formXtreamServerUrl = "";
        formXtreamUsername = "";
        formXtreamCredential = "";
        formError = "";
    }

    function editSource(source: IptvSource) {
        editingSourceId = source.id;
        formKind = source.kind;
        formName = source.name;
        if (source.kind === "xtream") {
            formM3uUrl = "";
            formEpgUrl = "";
            formXtreamServerUrl = source.serverUrl;
            formXtreamUsername = source.username;
            formXtreamCredential = source.credential;
        } else {
            formM3uUrl = source.m3uUrl;
            formEpgUrl = source.epgUrl ?? "";
            formXtreamServerUrl = "";
            formXtreamUsername = "";
            formXtreamCredential = "";
        }
        formError = "";
    }

    function setFormKind(kind: IptvSourceKind) {
        formKind = kind;
        formError = "";
    }

    function fillDispatcharrExample() {
        if (!IPTV_EXAMPLE) return;
        formKind = "m3u";
        formName = IPTV_EXAMPLE.name;
        formM3uUrl = IPTV_EXAMPLE.m3uUrl;
        formEpgUrl = IPTV_EXAMPLE.epgUrl;
        formError = "";
    }

    function saveSource() {
        try {
            if (editingSourceId) {
                const updated =
                    formKind === "xtream"
                        ? updateIptvSource(editingSourceId, {
                              kind: "xtream",
                              name: formName,
                              serverUrl: formXtreamServerUrl,
                              username: formXtreamUsername,
                              credential: formXtreamCredential,
                          })
                        : updateIptvSource(editingSourceId, {
                              kind: "m3u",
                              name: formName,
                              m3uUrl: formM3uUrl,
                              epgUrl: formEpgUrl,
                          });
                if (!updated) {
                    throw new Error("The selected IPTV source no longer exists");
                }
                selectedSourceId = updated.id;
                trackEvent("iptv_source_updated");
            } else {
                const source =
                    formKind === "xtream"
                        ? addIptvSource({
                              kind: "xtream",
                              name: formName,
                              serverUrl: formXtreamServerUrl,
                              username: formXtreamUsername,
                              credential: formXtreamCredential,
                          })
                        : addIptvSource({
                              kind: "m3u",
                              name: formName,
                              m3uUrl: formM3uUrl,
                              epgUrl: formEpgUrl,
                          });
                selectedSourceId = source.id;
                trackEvent("iptv_source_added");
            }
            resetForm();
        } catch (error) {
            formError = error instanceof Error ? error.message : String(error);
        }
    }

    function deleteSource(source: IptvSource) {
        const confirmed =
            typeof window === "undefined" ||
            window.confirm(`Remove IPTV source "${source.name}"?`);
        if (!confirmed) return;

        removeIptvSource(source.id);
        if (loadedSourceId === source.id) {
            loadedSourceId = "";
            loadedSourceCacheKey = "";
            refreshResult = null;
        }
        if (editingSourceId === source.id) {
            resetForm();
        }
        trackEvent("iptv_source_removed");
    }

    async function refreshSelectedSource() {
        if (!selectedSource) {
            refreshError = "No IPTV source configured";
            return;
        }

        const source = selectedSource;
        const sourceCacheKey = selectedSourceCacheKey;
        refreshing = true;
        refreshError = "";

        try {
            const result = await refreshIptvSource(source);
            persistIptvRefreshResult(source, result);
            refreshResult = result;
            loadedSourceId = source.id;
            loadedSourceCacheKey = sourceCacheKey;
            selectedGroup = ALL_GROUPS;
            trackEvent("iptv_source_refreshed", {
                channel_count: result.stats.channelCount,
                group_count: result.stats.groupCount,
                programme_count: result.stats.programmeCount,
                has_epg: Boolean(result.guide),
            });
        } catch (error) {
            refreshError = error instanceof Error ? error.message : String(error);
            trackEvent("iptv_source_refresh_failed", {
                error_name: error instanceof Error ? error.name : "unknown",
            });
        } finally {
            refreshing = false;
        }
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

    function formatTime(value: Date) {
        return new Intl.DateTimeFormat(undefined, {
            hour: "numeric",
            minute: "2-digit",
        }).format(value);
    }

    function formatLoadedAt(value: string) {
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            return "Unknown";
        }

        return new Intl.DateTimeFormat(undefined, {
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
        }).format(parsed);
    }

    onMount(() => {
        guideTimer = setInterval(() => {
            guideNow = new Date();
        }, 60_000);

        void tick().then(() => {
            const source = selectedSource ?? $iptvSources[0] ?? null;
            if (!source) return;
            if (!selectedSourceId) {
                selectedSourceId = source.id;
            }
            hydrateStoredSource(source, getLiveSourceCacheKey(source));
        });
    });

    onDestroy(() => {
        if (guideTimer) {
            clearInterval(guideTimer);
        }
    });
</script>

<div class="min-h-screen bg-[#090909] text-white">
    <main class="mx-auto flex min-h-screen w-full max-w-[1760px] flex-col gap-5 px-5 py-5 lg:px-8 lg:py-7">
        <header class="rounded-[28px] border border-white/10 bg-[#2b2b2b]/56 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-xl">
            <div class="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                <div class="flex min-w-0 items-center gap-4">
                    <button
                        class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/8 text-white/80 transition-colors hover:bg-white/14"
                        aria-label="Back"
                        onclick={() => {
                            if (!router.back()) router.navigate("home");
                        }}
                    >
                        <ChevronLeft size={26} strokeWidth={2} />
                    </button>
                    <div class="flex min-w-0 items-center gap-3">
                        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/8">
                            <Tv size={25} strokeWidth={2} class="text-white/74" />
                        </div>
                        <div class="min-w-0">
                            <h1 class="truncate font-poppins text-[28px] font-semibold leading-tight">
                                Live TV
                            </h1>
                            <p class="truncate text-sm text-white/60">
                                {sourceSummary}
                            </p>
                        </div>
                    </div>
                </div>

                <div class="flex flex-wrap items-center gap-3">
                    {#if currentResult}
                        <span class="text-sm text-white/45">
                            Refreshed {formatLoadedAt(currentResult.loadedAt)}
                        </span>
                    {/if}
                    <button
                        class="flex h-11 items-center gap-2 rounded-full border border-white/10 bg-white/8 px-4 text-sm font-semibold text-white/78 transition-colors hover:bg-white/14 hover:text-white"
                        onclick={() => (showSourceManager = true)}
                    >
                        <Plus size={17} strokeWidth={2.4} />
                        Sources
                    </button>
                    <button
                        class="flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition-opacity hover:opacity-88 disabled:cursor-not-allowed disabled:opacity-45"
                        disabled={!selectedSource || refreshing}
                        onclick={refreshSelectedSource}
                    >
                        {#if refreshing}
                            <LoadingSpinner size="16px" color="#111111" />
                        {:else}
                            <RefreshCw size={17} strokeWidth={2.4} />
                        {/if}
                        Refresh
                    </button>
                </div>
            </div>
        </header>

        {#if refreshError}
            <div class="rounded-[20px] border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {refreshError}
            </div>
        {/if}

        {#if selectedSource}
            <section class="rounded-[28px] border border-white/10 bg-white/4 p-4 backdrop-blur-md">
                <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div class="grid min-w-0 flex-1 gap-3 md:grid-cols-[minmax(180px,0.8fr)_minmax(180px,0.8fr)_minmax(220px,1.2fr)]">
                        <label class="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/38">
                            Source
                            <select
                                class="h-12 rounded-2xl border border-white/10 bg-black/24 px-4 text-sm normal-case tracking-normal text-white outline-none focus:border-white/35"
                                bind:value={selectedSourceId}
                            >
                                {#each $iptvSources as source}
                                    <option value={source.id}>{source.name}</option>
                                {/each}
                            </select>
                        </label>

                        <label class="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/38">
                            Group
                            <select
                                class="h-12 rounded-2xl border border-white/10 bg-black/24 px-4 text-sm normal-case tracking-normal text-white outline-none focus:border-white/35 disabled:opacity-45"
                                bind:value={selectedGroup}
                                disabled={!currentResult}
                            >
                                <option value={ALL_GROUPS}>All groups</option>
                                {#each availableGroups as group}
                                    <option value={group.name}>
                                        {group.name} ({group.channelCount})
                                    </option>
                                {/each}
                            </select>
                        </label>

                        <label class="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/38">
                            Search
                            <div class="relative">
                                <Search
                                    size={19}
                                    strokeWidth={2.1}
                                    class="absolute left-4 top-1/2 -translate-y-1/2 text-white/42"
                                />
                                <input
                                    class="h-12 w-full rounded-2xl border border-white/10 bg-black/24 pl-11 pr-4 text-sm normal-case tracking-normal text-white outline-none focus:border-white/35 disabled:opacity-45"
                                    placeholder="Search channels"
                                    bind:value={searchQuery}
                                    disabled={!currentResult}
                                />
                            </div>
                        </label>
                    </div>

                    {#if currentResult}
                        <span class="text-sm text-white/45">
                            Showing {visibleChannels.length} of {currentResult.stats.channelCount}
                        </span>
                    {/if}
                </div>
            </section>
        {/if}

        {#if refreshing}
            <section class="flex min-h-[52vh] items-center justify-center rounded-[28px] border border-white/10 bg-[#2b2b2b]/56 backdrop-blur-xl">
                <div class="flex flex-col items-center gap-4 text-white/64">
                    <LoadingSpinner size="46px" />
                    <span>Refreshing channels</span>
                </div>
            </section>
        {:else if !selectedSource}
            <section class="flex min-h-[52vh] items-center justify-center rounded-[28px] border border-white/10 bg-[#2b2b2b]/56 p-6 text-center backdrop-blur-xl">
                <div class="flex max-w-xl flex-col items-center gap-4">
                    <div class="flex h-16 w-16 items-center justify-center rounded-[24px] bg-white/8">
                        <Tv size={30} strokeWidth={2} class="text-white/70" />
                    </div>
                    <div>
                        <h2 class="font-poppins text-2xl font-semibold">
                            Add a Live TV Source
                        </h2>
                        <p class="mt-2 text-sm leading-6 text-white/60">
                            Connect an M3U playlist or Xtream account to load channels and guide data.
                        </p>
                    </div>
                    <button
                        class="flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition-opacity hover:opacity-88"
                        onclick={() => {
                            resetForm();
                            showSourceManager = true;
                        }}
                    >
                        <Plus size={17} strokeWidth={2.4} />
                        Add Source
                    </button>
                </div>
            </section>
        {:else if !currentResult}
            <section class="flex min-h-[52vh] items-center justify-center rounded-[28px] border border-white/10 bg-[#2b2b2b]/56 p-6 text-center backdrop-blur-xl">
                <div class="flex max-w-xl flex-col items-center gap-4">
                    <div class="flex h-16 w-16 items-center justify-center rounded-[24px] bg-white/8">
                        <RefreshCw size={28} strokeWidth={2} class="text-white/70" />
                    </div>
                    <div>
                        <h2 class="font-poppins text-2xl font-semibold">
                            Load Channels
                        </h2>
                        <p class="mt-2 text-sm leading-6 text-white/60">
                            Refresh {selectedSource.name} to cache channels and guide data for this device.
                        </p>
                    </div>
                    <div class="flex flex-wrap justify-center gap-3">
                        <button
                            class="flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition-opacity hover:opacity-88"
                            onclick={refreshSelectedSource}
                        >
                            <RefreshCw size={17} strokeWidth={2.4} />
                            Refresh Source
                        </button>
                        <button
                            class="h-11 rounded-full border border-white/10 bg-white/8 px-5 text-sm font-semibold text-white/76 transition-colors hover:bg-white/14 hover:text-white"
                            onclick={() => (showSourceManager = true)}
                        >
                            Manage Sources
                        </button>
                    </div>
                </div>
            </section>
        {:else if visibleChannels.length === 0}
            <section class="flex min-h-[52vh] items-center justify-center rounded-[28px] border border-white/10 bg-[#2b2b2b]/56 p-6 text-center text-white/60 backdrop-blur-xl">
                No channels match the current filters.
            </section>
        {:else}
            <section class="overflow-hidden rounded-[28px] border border-white/10 bg-[#2b2b2b]/56 shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-xl">
                <div class="flex flex-col gap-2 border-b border-white/10 bg-white/[0.04] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 class="font-poppins text-lg font-semibold">
                            {guideTitle}
                        </h2>
                        <p class="text-sm text-white/45">
                            Click a channel or programme to start live playback.
                        </p>
                    </div>
                    <div class="text-sm tabular-nums text-white/46">
                        {formatTime(guideViewport.viewportStart)} to {formatTime(
                            guideViewport.viewportEnd,
                        )}
                    </div>
                </div>

                <div class="grid grid-cols-[88px_minmax(0,1fr)] sm:grid-cols-[108px_minmax(0,1fr)]">
                    <div class="border-r border-white/10 bg-black/18">
                        <div class="h-10 border-b border-white/10 bg-white/[0.03]"></div>
                        {#each guideRows as row (row.channel.id)}
                            <button
                                class="flex h-[86px] w-full flex-col items-center justify-center gap-1 border-b border-white/[0.06] px-2 text-center transition-colors hover:bg-white/[0.06]"
                                title={row.channel.name}
                                aria-label={`Play ${row.channel.name}`}
                                onclick={() => playChannel(row.channel)}
                            >
                                <div class="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-black/32 ring-1 ring-white/[0.06]">
                                    {#if row.channel.logo}
                                        <img
                                            src={row.channel.logo}
                                            alt=""
                                            class="max-h-full max-w-full object-contain"
                                            loading="lazy"
                                            onerror={(event) => {
                                                (event.currentTarget as HTMLImageElement).style.display = "none";
                                            }}
                                        />
                                    {:else}
                                        <Tv size={22} strokeWidth={2} class="text-white/34" />
                                    {/if}
                                </div>
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
                                        class="pointer-events-none absolute bottom-0 top-0 z-30 -translate-x-1/2"
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
                                                    onclick={() => playChannel(row.channel)}
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
                                                onclick={() => playChannel(row.channel)}
                                            >
                                                <span class="font-poppins text-[13px] font-semibold">
                                                    {guideFallbackLabel(Boolean(currentResult.guide))}
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
            </section>
        {/if}
    </main>

    {#if showSourceManager}
        <div
            class="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onclick={(event) => {
                if (event.currentTarget === event.target) showSourceManager = false;
            }}
            onkeydown={(event) => {
                if (event.key === "Escape") showSourceManager = false;
            }}
            role="button"
            tabindex="0"
        >
            <section
                class="max-h-[92vh] w-full max-w-[1040px] overflow-y-auto rounded-[28px] border border-white/10 bg-[#2b2b2b]/95 p-5 shadow-[0_32px_100px_rgba(0,0,0,0.48)] backdrop-blur-xl"
                role="dialog"
                aria-modal="true"
                tabindex="-1"
            >
                <div class="mb-5 flex items-start justify-between gap-4">
                    <div>
                        <h2 class="font-poppins text-2xl font-semibold">
                            Live TV Sources
                        </h2>
                        <p class="mt-1 text-sm text-white/60">
                            Add M3U playlists, Xtream accounts, and guide data.
                        </p>
                    </div>
                    <button
                        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/8 text-white/72 transition-colors hover:bg-white/14 hover:text-white"
                        aria-label="Close source manager"
                        onclick={() => (showSourceManager = false)}
                    >
                        <X size={20} strokeWidth={2.2} />
                    </button>
                </div>

                <div class="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)]">
                    <section class="rounded-[24px] bg-white/4 p-4">
                        <div class="mb-4 flex items-center justify-between gap-3">
                            <h3 class="font-poppins text-lg font-semibold">
                                Sources
                            </h3>
                            <button
                                class="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-white/70 transition-colors hover:bg-white/14 hover:text-white"
                                aria-label="Add source"
                                onclick={resetForm}
                            >
                                <Plus size={18} strokeWidth={2.4} />
                            </button>
                        </div>

                        {#if $iptvSources.length > 0}
                            <div class="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
                                {#each $iptvSources as source}
                                    <div
                                        class={`flex flex-col gap-3 rounded-2xl border p-3 transition-colors sm:flex-row sm:items-center sm:justify-between ${
                                            selectedSourceId === source.id
                                                ? "border-white/18 bg-white/[0.10]"
                                                : "border-white/8 bg-white/[0.04]"
                                        }`}
                                    >
                                        <button
                                            class="min-w-0 flex-1 text-left"
                                            onclick={() => (selectedSourceId = source.id)}
                                        >
                                            <p class="truncate font-medium text-white">
                                                {source.name}
                                            </p>
                                            <p class="mt-1 text-xs uppercase tracking-[0.12em] text-white/42">
                                                {source.kind === "xtream" ? "Xtream" : "M3U"}
                                            </p>
                                        </button>
                                        <div class="flex shrink-0 gap-2">
                                            <button
                                                class="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-white/70 transition-colors hover:bg-white/14 hover:text-white"
                                                aria-label={`Edit ${source.name}`}
                                                onclick={() => editSource(source)}
                                            >
                                                <Pencil size={16} strokeWidth={2.2} />
                                            </button>
                                            <button
                                                class="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-white/70 transition-colors hover:bg-red-500/20 hover:text-red-100"
                                                aria-label={`Remove ${source.name}`}
                                                onclick={() => deleteSource(source)}
                                            >
                                                <Trash2 size={16} strokeWidth={2.2} />
                                            </button>
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        {:else}
                            <div class="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-5 text-sm text-white/56">
                                No source configured yet.
                            </div>
                        {/if}
                    </section>

                    <section class="rounded-[24px] bg-white/4 p-4">
                        <h3 class="font-poppins text-lg font-semibold">
                            {editingSourceId ? "Edit Source" : "Add Source"}
                        </h3>
                        <div class="mt-4 flex flex-col gap-4">
                            <label class="flex flex-col gap-2 text-sm text-white/62">
                                Name
                                <input
                                    class="h-11 rounded-2xl border border-white/10 bg-black/24 px-4 text-white outline-none focus:border-white/35"
                                    bind:value={formName}
                                />
                            </label>

                            <div class="grid grid-cols-2 gap-1 rounded-full border border-white/10 bg-black/24 p-1">
                                <button
                                    class={`h-9 rounded-full text-sm font-semibold transition-colors ${formKind === "m3u" ? "bg-white text-black" : "text-white/62 hover:bg-white/8 hover:text-white"}`}
                                    aria-pressed={formKind === "m3u"}
                                    onclick={() => setFormKind("m3u")}
                                >
                                    M3U URL
                                </button>
                                <button
                                    class={`h-9 rounded-full text-sm font-semibold transition-colors ${formKind === "xtream" ? "bg-white text-black" : "text-white/62 hover:bg-white/8 hover:text-white"}`}
                                    aria-pressed={formKind === "xtream"}
                                    onclick={() => setFormKind("xtream")}
                                >
                                    Xtream
                                </button>
                            </div>

                            {#if formKind === "m3u"}
                                <label class="flex flex-col gap-2 text-sm text-white/62">
                                    M3U URL
                                    <input
                                        class="h-11 rounded-2xl border border-white/10 bg-black/24 px-4 text-white outline-none focus:border-white/35"
                                        bind:value={formM3uUrl}
                                        inputmode="url"
                                    />
                                </label>
                                <label class="flex flex-col gap-2 text-sm text-white/62">
                                    XMLTV URL
                                    <input
                                        class="h-11 rounded-2xl border border-white/10 bg-black/24 px-4 text-white outline-none focus:border-white/35"
                                        bind:value={formEpgUrl}
                                        inputmode="url"
                                    />
                                </label>
                            {:else}
                                <label class="flex flex-col gap-2 text-sm text-white/62">
                                    Server URL
                                    <input
                                        class="h-11 rounded-2xl border border-white/10 bg-black/24 px-4 text-white outline-none focus:border-white/35"
                                        bind:value={formXtreamServerUrl}
                                        inputmode="url"
                                    />
                                </label>
                                <label class="flex flex-col gap-2 text-sm text-white/62">
                                    Username
                                    <input
                                        class="h-11 rounded-2xl border border-white/10 bg-black/24 px-4 text-white outline-none focus:border-white/35"
                                        bind:value={formXtreamUsername}
                                        autocomplete="off"
                                    />
                                </label>
                                <label class="flex flex-col gap-2 text-sm text-white/62">
                                    Password
                                    <input
                                        class="h-11 rounded-2xl border border-white/10 bg-black/24 px-4 text-white outline-none focus:border-white/35"
                                        bind:value={formXtreamCredential}
                                        type="password"
                                        autocomplete="off"
                                    />
                                </label>
                            {/if}

                            {#if formError}
                                <div class="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                                    {formError}
                                </div>
                            {/if}

                            <div class="flex flex-wrap gap-2">
                                <button
                                    class="h-11 flex-1 rounded-full bg-white px-5 text-sm font-semibold text-black transition-opacity hover:opacity-88"
                                    onclick={saveSource}
                                >
                                    {editingSourceId ? "Save Source" : "Add Source"}
                                </button>
                                {#if editingSourceId}
                                    <button
                                        class="h-11 flex-1 rounded-full bg-white/8 px-5 text-sm font-semibold text-white/78 transition-colors hover:bg-white/14"
                                        onclick={resetForm}
                                    >
                                        Cancel
                                    </button>
                                {/if}
                            </div>

                            {#if isDev && IPTV_EXAMPLE}
                                <button
                                    class="h-10 rounded-full border border-white/10 text-sm text-white/60 transition-colors hover:bg-white/8 hover:text-white/82"
                                    onclick={fillDispatcharrExample}
                                >
                                    Use IPTV example
                                </button>
                            {/if}
                        </div>
                    </section>
                </div>
            </section>
        </div>
    {/if}
</div>

<style>
    .no-scrollbar::-webkit-scrollbar {
        display: none;
    }

    .no-scrollbar {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
</style>
