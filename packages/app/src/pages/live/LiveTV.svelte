<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import {
        ChevronLeft,
        Pencil,
        Play,
        Plus,
        RefreshCw,
        Search,
        Trash2,
        Tv,
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
    import { getNowNext } from "../../lib/iptv/xmltv";
    import type {
        IptvChannel,
        IptvRefreshResult,
        IptvSource,
        XmltvProgramme,
    } from "../../lib/iptv/types";

    const ALL_GROUPS = "__all__";
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
    let refreshResult: IptvRefreshResult | null = null;
    let refreshing = false;
    let refreshError = "";
    let formError = "";
    let editingSourceId: string | null = null;
    let formName = "";
    let formM3uUrl = "";
    let formEpgUrl = "";
    let selectedGroup = ALL_GROUPS;
    let searchQuery = "";
    let guideNow = new Date();
    let guideTimer: ReturnType<typeof setInterval> | null = null;

    const isDev = import.meta.env.DEV;

    $: selectedSource =
        $iptvSources.find((source) => source.id === selectedSourceId) ?? null;
    $: currentResult =
        refreshResult && loadedSourceId === selectedSourceId ? refreshResult : null;
    $: availableGroups = currentResult?.groups ?? [];
    $: sourceSummary = currentResult
        ? `${currentResult.stats.channelCount} channels / ${currentResult.stats.groupCount} groups`
        : "";
    $: visibleChannels = getVisibleChannels(
        currentResult?.channels ?? [],
        selectedGroup,
        searchQuery,
    );
    $: if (!selectedSourceId && $iptvSources.length > 0) {
        selectedSourceId = $iptvSources[0].id;
    }
    $: if (selectedSourceId && !$iptvSources.some((source) => source.id === selectedSourceId)) {
        selectedSourceId = $iptvSources[0]?.id ?? "";
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

    function resetForm() {
        editingSourceId = null;
        formName = "";
        formM3uUrl = "";
        formEpgUrl = "";
        formError = "";
    }

    function editSource(source: IptvSource) {
        editingSourceId = source.id;
        formName = source.name;
        formM3uUrl = source.m3uUrl;
        formEpgUrl = source.epgUrl ?? "";
        formError = "";
    }

    function fillDispatcharrExample() {
        if (!IPTV_EXAMPLE) return;
        formName = IPTV_EXAMPLE.name;
        formM3uUrl = IPTV_EXAMPLE.m3uUrl;
        formEpgUrl = IPTV_EXAMPLE.epgUrl;
        formError = "";
    }

    function saveSource() {
        try {
            if (editingSourceId) {
                const updated = updateIptvSource(editingSourceId, {
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
                const source = addIptvSource({
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

        refreshing = true;
        refreshError = "";

        try {
            const result = await refreshIptvSource(selectedSource);
            refreshResult = result;
            loadedSourceId = selectedSource.id;
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
        return new Intl.DateTimeFormat(undefined, {
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
        }).format(new Date(value));
    }

    function programmeText(programme: XmltvProgramme | null) {
        if (!programme) return "";
        return `${formatTime(programme.start)} ${programme.title}`;
    }

    onMount(() => {
        guideTimer = setInterval(() => {
            guideNow = new Date();
        }, 60_000);
    });

    onDestroy(() => {
        if (guideTimer) {
            clearInterval(guideTimer);
        }
    });
</script>

<div class="min-h-screen bg-[#090909] text-white">
    <div class="sticky top-0 z-40 border-b border-white/10 bg-[#090909]/92 backdrop-blur-xl">
        <div class="flex items-center justify-between gap-6 px-8 py-5">
            <div class="flex items-center gap-4 min-w-0">
                <button
                    class="flex h-12 w-12 items-center justify-center rounded-full bg-white/8 text-white/80 transition-colors hover:bg-white/14"
                    aria-label="Back"
                    onclick={() => {
                        if (!router.back()) router.navigate("home");
                    }}
                >
                    <ChevronLeft size={26} strokeWidth={2} />
                </button>
                <div class="flex items-center gap-3 min-w-0">
                    <Tv size={28} strokeWidth={2} class="text-white/70" />
                    <div class="min-w-0">
                        <h1 class="truncate font-poppins text-[28px] font-semibold leading-tight">
                            Live TV
                        </h1>
                        <p class="truncate text-sm text-white/48">
                            {sourceSummary || "No channels loaded"}
                        </p>
                    </div>
                </div>
            </div>

            <div class="flex items-center gap-3">
                {#if currentResult}
                    <span class="hidden text-sm text-white/45 md:inline">
                        Refreshed {formatLoadedAt(currentResult.loadedAt)}
                    </span>
                {/if}
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
    </div>

    <div class="grid min-h-[calc(100vh-89px)] grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside class="border-b border-white/10 bg-[#111111] p-6 lg:border-b-0 lg:border-r">
            <section class="flex flex-col gap-4">
                <div class="flex items-center justify-between gap-3">
                    <h2 class="font-poppins text-lg font-semibold">
                        Sources
                    </h2>
                    <button
                        class="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-white/70 transition-colors hover:bg-white/14"
                        aria-label="Add source"
                        onclick={resetForm}
                    >
                        <Plus size={18} strokeWidth={2.4} />
                    </button>
                </div>

                {#if $iptvSources.length > 0}
                    <select
                        class="h-11 w-full rounded-lg border border-white/10 bg-black/35 px-3 text-sm text-white outline-none focus:border-white/35"
                        bind:value={selectedSourceId}
                    >
                        {#each $iptvSources as source}
                            <option value={source.id}>{source.name}</option>
                        {/each}
                    </select>
                {:else}
                    <div class="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/56">
                        No source configured
                    </div>
                {/if}

                {#if selectedSource}
                    <div class="flex gap-2">
                        <button
                            class="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-white/8 text-sm text-white/76 transition-colors hover:bg-white/14"
                            onclick={() => editSource(selectedSource)}
                        >
                            <Pencil size={16} strokeWidth={2.2} />
                            Edit
                        </button>
                        <button
                            class="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-white/8 text-sm text-white/76 transition-colors hover:bg-white/14"
                            onclick={() => deleteSource(selectedSource)}
                        >
                            <Trash2 size={16} strokeWidth={2.2} />
                            Remove
                        </button>
                    </div>
                {/if}
            </section>

            <section class="mt-8 flex flex-col gap-4">
                <h2 class="font-poppins text-lg font-semibold">
                    {editingSourceId ? "Edit Source" : "Add Source"}
                </h2>
                <label class="flex flex-col gap-2 text-sm text-white/62">
                    Name
                    <input
                        class="h-11 rounded-lg border border-white/10 bg-black/35 px-3 text-white outline-none focus:border-white/35"
                        bind:value={formName}
                    />
                </label>
                <label class="flex flex-col gap-2 text-sm text-white/62">
                    M3U URL
                    <input
                        class="h-11 rounded-lg border border-white/10 bg-black/35 px-3 text-white outline-none focus:border-white/35"
                        bind:value={formM3uUrl}
                        inputmode="url"
                    />
                </label>
                <label class="flex flex-col gap-2 text-sm text-white/62">
                    XMLTV URL
                    <input
                        class="h-11 rounded-lg border border-white/10 bg-black/35 px-3 text-white outline-none focus:border-white/35"
                        bind:value={formEpgUrl}
                        inputmode="url"
                    />
                </label>

                {#if formError}
                    <div class="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                        {formError}
                    </div>
                {/if}

                <div class="flex gap-2">
                    <button
                        class="h-11 flex-1 rounded-lg bg-white text-sm font-semibold text-black transition-opacity hover:opacity-88"
                        onclick={saveSource}
                    >
                        {editingSourceId ? "Save" : "Add"}
                    </button>
                    {#if editingSourceId}
                        <button
                            class="h-11 flex-1 rounded-lg bg-white/8 text-sm font-semibold text-white/78 transition-colors hover:bg-white/14"
                            onclick={resetForm}
                        >
                            Cancel
                        </button>
                    {/if}
                </div>

                {#if isDev && IPTV_EXAMPLE}
                    <button
                        class="h-10 rounded-lg border border-white/10 text-sm text-white/60 transition-colors hover:bg-white/8 hover:text-white/82"
                        onclick={fillDispatcharrExample}
                    >
                        Use IPTV example
                    </button>
                {/if}
            </section>
        </aside>

        <main class="min-w-0 p-6 lg:p-8">
            <div class="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div class="flex min-w-0 flex-1 flex-col gap-3 md:flex-row">
                    <div class="relative min-w-0 flex-1">
                        <Search
                            size={19}
                            strokeWidth={2.1}
                            class="absolute left-3 top-1/2 -translate-y-1/2 text-white/42"
                        />
                        <input
                            class="h-12 w-full rounded-lg border border-white/10 bg-white/[0.04] pl-10 pr-3 text-white outline-none focus:border-white/35"
                            placeholder="Search channels"
                            bind:value={searchQuery}
                        />
                    </div>

                    <select
                        class="h-12 min-w-[220px] rounded-lg border border-white/10 bg-white/[0.04] px-3 text-white outline-none focus:border-white/35"
                        bind:value={selectedGroup}
                    >
                        <option value={ALL_GROUPS}>All groups</option>
                        {#each availableGroups as group}
                            <option value={group.name}>
                                {group.name} ({group.channelCount})
                            </option>
                        {/each}
                    </select>
                </div>

                {#if currentResult}
                    <div class="text-sm text-white/45">
                        Showing {visibleChannels.length} of {currentResult.stats.channelCount}
                    </div>
                {/if}
            </div>

            {#if refreshError}
                <div class="mb-5 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {refreshError}
                </div>
            {/if}

            {#if refreshing}
                <div class="flex h-[52vh] items-center justify-center">
                    <div class="flex flex-col items-center gap-4 text-white/64">
                        <LoadingSpinner size="46px" />
                        <span>Refreshing channels</span>
                    </div>
                </div>
            {:else if !selectedSource}
                <div class="flex h-[52vh] items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/56">
                    No source configured
                </div>
            {:else if !currentResult}
                <div class="flex h-[52vh] items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/56">
                    No channels loaded
                </div>
            {:else if visibleChannels.length === 0}
                <div class="flex h-[52vh] items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/56">
                    No channels match
                </div>
            {:else}
                <div class="grid grid-cols-1 gap-3 2xl:grid-cols-2">
                    {#each visibleChannels as channel (channel.id)}
                        {@const guide = getChannelGuide(channel)}
                        <button
                            class="grid min-h-[92px] grid-cols-[58px_minmax(0,1fr)_auto] items-center gap-4 rounded-lg border border-white/8 bg-white/[0.035] px-4 py-3 text-left transition-colors hover:border-white/20 hover:bg-white/[0.07]"
                            onclick={() => playChannel(channel)}
                        >
                            <div class="flex h-[58px] w-[58px] items-center justify-center overflow-hidden rounded-md bg-black/45">
                                {#if channel.logo}
                                    <img
                                        src={channel.logo}
                                        alt=""
                                        class="max-h-full max-w-full object-contain"
                                        loading="lazy"
                                        onerror={(event) => {
                                            (event.currentTarget as HTMLImageElement).style.display = "none";
                                        }}
                                    />
                                {:else}
                                    <Tv size={24} strokeWidth={2} class="text-white/35" />
                                {/if}
                            </div>

                            <div class="min-w-0">
                                <div class="flex items-center gap-2">
                                    {#if channel.number}
                                        <span class="shrink-0 rounded bg-white/8 px-2 py-0.5 text-xs tabular-nums text-white/52">
                                            {channel.number}
                                        </span>
                                    {/if}
                                    <span class="truncate font-poppins text-[17px] font-medium text-white">
                                        {channel.name}
                                    </span>
                                </div>
                                <div class="mt-1 truncate text-sm text-white/45">
                                    {channel.group}
                                </div>
                                {#if guide.now}
                                    <div class="mt-2 truncate text-sm text-white/72">
                                        {programmeText(guide.now)}
                                    </div>
                                {/if}
                                {#if guide.next}
                                    <div class="mt-1 truncate text-xs text-white/42">
                                        Next: {programmeText(guide.next)}
                                    </div>
                                {/if}
                            </div>

                            <div class="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black">
                                <Play size={18} strokeWidth={2.4} fill="currentColor" />
                            </div>
                        </button>
                    {/each}
                </div>
            {/if}
        </main>
    </div>
</div>
