<script lang="ts">
    import { fade } from "svelte/transition";
    import { createEventDispatcher, onMount } from "svelte";
    import type { Addon } from "../../../lib/db/db";
    import type { ShowResponse } from "../../../lib/library/types/meta_types";
    import type { ProgressMap, ProgressItem } from "../../../pages/meta/types";
    import LoadingSpinner from "../../common/LoadingSpinner.svelte";
    import { trackEvent } from "../../../lib/analytics";
    import { X, Link2 } from "lucide-svelte";
    import {
        buildAudioLanguageBadge,
        detectProvider,
        formatAvailability,
        parsePeerCount,
    } from "../../../lib/streams/streamMetadata";

    export let streamsPopupVisible = false;
    export let addons: Addon[] = [];
    export let selectedAddon: string;
    export let loadingStreams = false;
    export let streams: any[] = [];
    export let metaData: ShowResponse | null = null;
    export let selectedEpisode: any = null;
    export let progressMap: ProgressMap | null = null;
    export let progressSignature: string | number | null = null;

    const dispatch = createEventDispatcher();

    export const portal = (node: HTMLElement) => {
        if (typeof document === "undefined") {
            return { destroy() {} };
        }
        document.body.appendChild(node);
        return {
            destroy() {
                if (node.parentNode) {
                    node.parentNode.removeChild(node);
                }
            },
        };
    };

    const RESOLUTION_FILTERS = [
        { label: "All", value: "all" },
        { label: "2160p", value: "2160p" },
        { label: "1440p", value: "1440p" },
        { label: "1080p", value: "1080p" },
        { label: "720p", value: "720p" },
        { label: "480p", value: "480p" },
        { label: "Other", value: "other" },
    ] as const;

    type ResolutionFilter = (typeof RESOLUTION_FILTERS)[number]["value"];

    let resolutionFilter: ResolutionFilter = "all";
    let excludeHDR = false;
    let hasTrackedOpen = false;

    const getStreamCounts = () => {
        const localCount = streams.filter(
            (stream) => stream?.raffiSource === "local",
        ).length;
        return {
            total: streams.length,
            local: localCount,
            addon: Math.max(0, streams.length - localCount),
        };
    };

    function resetFilters() {
        resolutionFilter = "all";
        excludeHDR = false;
        trackEvent("stream_filters_reset", getStreamCounts());
    }

    function setResolutionFilter(value: ResolutionFilter) {
        if (resolutionFilter === value) return;
        resolutionFilter = value;
        trackEvent("stream_filter_resolution", {
            value,
            exclude_hdr: excludeHDR,
            ...getStreamCounts(),
        });
    }

    function toggleExcludeHDR() {
        excludeHDR = !excludeHDR;
        trackEvent("stream_filter_hdr", {
            excluded: excludeHDR,
            resolution_filter: resolutionFilter,
            ...getStreamCounts(),
        });
    }

    function selectAddon(addon: Addon) {
        if (selectedAddon === addon.transport_url) return;
        selectedAddon = addon.transport_url;
        trackEvent("stream_addon_selected", {
            addon_name: addon?.manifest?.name ?? "Unknown",
            ...getStreamCounts(),
        });
    }

    function close() {
        trackEvent("stream_list_closed", {
            filters_active: filtersActive,
            resolution_filter: resolutionFilter,
            exclude_hdr: excludeHDR,
            ...getStreamCounts(),
        });
        dispatch("close");
    }

    function onStreamClick(stream: any) {
        dispatch("streamClick", stream);
    }

    const relativeTimeFormatter =
        typeof Intl !== "undefined"
            ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
            : null;

    const absoluteDateFormatter =
        typeof Intl !== "undefined"
            ? new Intl.DateTimeFormat(undefined, {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
              })
            : null;

    const RELATIVE_TIME_DIVISIONS: Array<{
        amount: number;
        unit:
            | "year"
            | "month"
            | "week"
            | "day"
            | "hour"
            | "minute"
            | "second";
    }> = [
        { amount: 60, unit: "second" },
        { amount: 60, unit: "minute" },
        { amount: 24, unit: "hour" },
        { amount: 7, unit: "day" },
        { amount: 4.34524, unit: "week" },
        { amount: 12, unit: "month" },
        { amount: Infinity, unit: "year" },
    ];

    function formatRelative(date: Date) {
        if (!relativeTimeFormatter) return null;
        let duration = (date.getTime() - Date.now()) / 1000;

        for (const division of RELATIVE_TIME_DIVISIONS) {
            if (
                Math.abs(duration) < division.amount ||
                division.amount === Infinity
            ) {
                return relativeTimeFormatter.format(
                    Math.round(duration),
                    division.unit,
                );
            }
            duration /= division.amount;
        }

        return null;
    }

    function getReleaseInfo(dateString?: string | null) {
        if (!dateString) return { absolute: null, relative: null };
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) {
            return { absolute: null, relative: null };
        }

        return {
            absolute: absoluteDateFormatter
                ? absoluteDateFormatter.format(date)
                : date.toDateString(),
            relative: formatRelative(date),
        };
    }

    interface StreamBadge {
        label: string;
        variant?: "accent" | "muted" | "outline";
    }

    interface ParsedStreamMetadata {
        providerLabel: string;
        hostLabel: string | null;
        resolution: string | null;
        resolutionLabel: string | null;
        isHDR: boolean;
        featureBadges: StreamBadge[];
        statusBadges: StreamBadge[];
        peerCount: number | null;
        isP2P: boolean;
        infoLine: string | null;
    }

    interface EpisodeProgressDetails {
        percent: number;
        timeLeftLabel: string;
        watched: boolean;
    }

    function parseStreamMetadata(stream: any): ParsedStreamMetadata {
        const isLocal = stream?.raffiSource === "local";
        const title = stream?.title ?? "";
        const description = stream?.description ?? "";
        const behaviorFilename = stream?.behaviorHints?.filename ?? "";
        const behaviorGroup = stream?.behaviorHints?.bingeGroup ?? "";

        const primaryText = [title, description]
            .map((v) => String(v ?? ""))
            .filter(Boolean)
            .join("\n");

        const lines = primaryText
            .split("\n")
            .map((line: string) => line.trim())
            .filter(Boolean);

        const detailText = lines.slice(1).join(" ") || lines.join(" ");
        const fullText = `${primaryText} ${stream?.name ?? ""} ${behaviorFilename} ${behaviorGroup}`;

        let resolutionMatch = fullText.match(/(2160|1440|1080|720|540|480|360|240)p/i);
        let resolution: string | null = resolutionMatch ? `${resolutionMatch[1]}p` : null;
        if (!resolution && /4k/i.test(fullText)) {
            resolution = "2160p";
        }

        const resolutionLabel = resolution
            ? resolution === "2160p" && /4k/i.test(fullText)
                ? "4K"
                : resolution.toUpperCase()
            : null;

        const hasDolbyVision = /Dolby\s?Vision|\bDV\b/i.test(fullText);
        const hasHDR = /HDR/i.test(fullText) || hasDolbyVision;
        const codecLabel = /AV1/i.test(fullText)
            ? "AV1"
            : /(?:x265|H\.?(?:265)|HEVC)/i.test(fullText)
                ? "HEVC"
                : /(?:x264|H\.?(?:264))/i.test(fullText)
                    ? "H.264"
                    : null;
        const audioLabel = /Atmos/i.test(fullText)
            ? "Dolby Atmos"
            : /DDP(?:\s?5\.1)?|DD5\.1/i.test(fullText)
                ? "DDP 5.1"
                : /DTS/i.test(fullText)
                    ? "DTS"
                    : null;
        const audioLanguagesLabel = buildAudioLanguageBadge(fullText);

        const sizeMatch = fullText.match(/(\d+(?:\.\d+)?)\s?(GB|MB)/i);
        const sizeLabel = sizeMatch
            ? `${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}`
            : null;

        const provider = isLocal
            ? "Local"
            : detectProvider(detailText) ||
                detectProvider(fullText) ||
                stream?.name ||
                "Unknown Source";

        const hostLabel =
            stream?.name && stream.name !== provider ? stream.name : null;

        const availability = formatAvailability(
            fullText.match(/\[([A-Za-z0-9+ ]+)\]/)?.[1] ?? null,
        );

        const isP2P =
            !isLocal &&
            (Boolean(stream?.infoHash) ||
                Boolean(stream?.url && stream.url.startsWith("magnet:")));

        const peerCount = parsePeerCount(detailText);
        const isP2PAdjusted = isP2P || peerCount != null;

        const featureBadges: StreamBadge[] = [];
        const statusBadges: StreamBadge[] = [];
        const seen = new Set<string>();

        function addFeature(label?: string | null, variant?: "accent" | "muted") {
            if (!label) return;
            const key = label.toUpperCase();
            if (seen.has(key)) return;
            seen.add(key);
            featureBadges.push({ label, variant });
        }

        if (availability) {
            statusBadges.push({ label: availability, variant: "accent" });
        }

        if (isLocal) {
            statusBadges.push({ label: "LOCAL", variant: "accent" });
        }

        if (isP2P) {
            statusBadges.push({ label: "P2P", variant: "outline" });
        }

        addFeature(resolutionLabel);
        if (hasDolbyVision) {
            addFeature("Dolby Vision");
        } else if (hasHDR) {
            addFeature("HDR");
        }
        addFeature(codecLabel);
        addFeature(audioLabel);
        addFeature(audioLanguagesLabel, "accent");
        addFeature(sizeLabel, "muted");

        return {
            providerLabel: provider,
            hostLabel,
            resolution,
            resolutionLabel,
            isHDR: hasHDR,
            featureBadges,
            statusBadges,
            peerCount,
            isP2P: isP2PAdjusted,
            infoLine: hostLabel ? `via ${hostLabel}` : null,
        };
    }

    $: filteredAddons = addons.filter((addon) => {
        if (!addon.manifest || !addon.manifest.resources) return false;
        return addon.manifest.resources.some(
            (resource: any) =>
                (typeof resource === "object" && resource.name === "stream") ||
                resource === "stream",
        );
    });

    $: if (streamsPopupVisible && !hasTrackedOpen) {
        hasTrackedOpen = true;
        trackEvent("stream_list_opened", {
            ...getStreamCounts(),
            resolution_filter: resolutionFilter,
            exclude_hdr: excludeHDR,
        });
    }

    $: if (!streamsPopupVisible && hasTrackedOpen) {
        hasTrackedOpen = false;
    }

    $: enrichedStreams = (() => {
        const keyCounts = new Map<string, number>();

        return streams.map((stream, index) => {
            const baseKey =
                stream?.url ||
                stream?.infoHash ||
                `${stream?.name ?? "stream"}-${stream?.fileIdx ?? "na"}`;

            const seen = keyCounts.get(baseKey) ?? 0;
            keyCounts.set(baseKey, seen + 1);

            const key = seen === 0 ? baseKey : `${baseKey}::dup-${seen}-${index}`;

            return {
                key,
                stream,
                meta: parseStreamMetadata(stream),
            };
        });
    })();

    $: filteredStreams = (() => {
        const filtered = enrichedStreams.filter(({ meta }) => {
            if (excludeHDR && meta.isHDR) return false;
            if (resolutionFilter === "all") return true;
            if (resolutionFilter === "other") return !meta.resolution;
            return meta.resolution === resolutionFilter;
        });

        const p2p: typeof filtered = [];
        const rest: typeof filtered = [];

        for (const item of filtered) {
            if (item.meta.isP2P) {
                p2p.push(item);
            } else {
                rest.push(item);
            }
        }

        p2p.sort((a, b) => {
            const aPeers = a.meta.peerCount ?? -1;
            const bPeers = b.meta.peerCount ?? -1;
            return bPeers - aPeers;
        });

        return [...p2p, ...rest];
    })();

    $: localFilteredStreams = filteredStreams.filter(
        (item) => item.stream?.raffiSource === "local",
    );
    $: addonFilteredStreams = filteredStreams.filter(
        (item) => item.stream?.raffiSource !== "local",
    );

    $: filtersActive = resolutionFilter !== "all" || excludeHDR;

    $: episodeTitle =
        selectedEpisode?.name ||
        selectedEpisode?.title ||
        metaData?.meta?.name ||
        "Episode details";

    $: episodeDescription =
        selectedEpisode?.overview ||
        selectedEpisode?.description ||
        metaData?.meta?.description ||
        "";

    $: episodeSeasonNumber = selectedEpisode
        ? `${selectedEpisode.season ?? "?"}`
        : null;

    $: episodeNumber = selectedEpisode
        ? `${selectedEpisode.episode ?? selectedEpisode.number ?? "?"}`
        : null;

    $: releaseInfo = getReleaseInfo(
        selectedEpisode?.released ||
            selectedEpisode?.firstAired ||
            metaData?.meta?.released ||
            null,
    );

    $: detailsThumbnail =
        selectedEpisode?.thumbnail ||
        metaData?.meta?.background ||
        metaData?.meta?.poster ||
        null;

    let thumbnailError = false;
    let lastThumbnail: string | null = null;

    $: if (detailsThumbnail !== lastThumbnail) {
        thumbnailError = false;
        lastThumbnail = detailsThumbnail ?? null;
    }

    function handleThumbnailError() {
        thumbnailError = true;
    }

    function coerceNumber(value: any): number | null {
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value === "string" && value.trim() !== "") {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) return parsed;
        }
        return null;
    }

    function buildEpisodeKeys(episode: any): string[] {
        if (!episode) return [];
        const season = coerceNumber(episode.season);
        const episodeNumbers = [
            coerceNumber(episode.episode),
            coerceNumber(episode.number),
            coerceNumber(episode.ids?.episode),
        ].filter((value): value is number => value != null);

        const rawKeys = new Set<string>();
        if (typeof episode.id === "string") {
            rawKeys.add(episode.id);
        }

        if (season != null) {
            if (episodeNumbers.length === 0) {
                rawKeys.add(`${season}:0`);
            } else {
                for (const num of episodeNumbers) {
                    rawKeys.add(`${season}:${num}`);
                    rawKeys.add(`${season}:${num.toString().padStart(2, "0")}`);
                }
            }
        }

        return [...rawKeys];
    }

    function parseKeySeasonEpisode(key: string) {
        if (typeof key !== "string") return null;
        const normalized = key.replace(/season/gi, "").replace(/episode/gi, "");
        const match = normalized.match(/(\d+)[^\d]+(\d+)/);
        if (match) {
            const season = Number(match[1]);
            const episode = Number(match[2]);
            if (Number.isFinite(season) && Number.isFinite(episode)) {
                return { season, episode };
            }
        }
        const colonMatch = key.split(":");
        if (colonMatch.length === 2) {
            const [s, e] = colonMatch.map((part) => Number(part));
            if (Number.isFinite(s) && Number.isFinite(e)) {
                return { season: s, episode: e };
            }
        }
        return null;
    }

    function isMovieContext() {
        if (metaData?.meta?.type) {
            return metaData.meta.type === "movie";
        }
        const seasonValue = coerceNumber(selectedEpisode?.season);
        return seasonValue === 0;
    }

    function hasResumeProgress(entry: ProgressItem | null) {
        return (
            entry != null &&
            entry.duration != null &&
            entry.duration > 0 &&
            entry.time != null &&
            entry.time > 0 &&
            !entry.watched
        );
    }

    let episodeProgressEntry: ProgressItem | null = null;
    let progressDetails: EpisodeProgressDetails | null = null;

    function getProgressEntry(): ProgressItem | null {
        if (!progressMap) return null;
        if (!streamsPopupVisible && !isMovieContext()) return null;
        if (!selectedEpisode && !isMovieContext()) return null;

        if (isMovieContext()) {
            const entry = progressMap as ProgressItem;
            return hasResumeProgress(entry) ? entry : null;
        }

        const map = progressMap as Record<string, ProgressItem>;
        const keys = buildEpisodeKeys(selectedEpisode);
        for (const key of keys) {
            const entry = map?.[key] ?? null;
            if (hasResumeProgress(entry)) {
                return entry;
            }
        }

        const season = coerceNumber(selectedEpisode?.season);
        const episodeNumbers = [
            coerceNumber(selectedEpisode?.episode),
            coerceNumber(selectedEpisode?.number),
        ].filter((value): value is number => value != null);

        if (season != null && episodeNumbers.length > 0) {
            for (const [key, entry] of Object.entries(map)) {
                const parsed = parseKeySeasonEpisode(key);
                if (
                    parsed &&
                    parsed.season === season &&
                    episodeNumbers.includes(parsed.episode) &&
                    hasResumeProgress(entry)
                ) {
                    return entry;
                }
            }
        }

        return null;
    }

    function computeProgressDetails(
        entry: ProgressItem | null,
    ): EpisodeProgressDetails | null {
        if (!entry) return null;
        const percent = Math.min(
            100,
            Math.max(0, (entry.time / entry.duration) * 100),
        );
        const remaining = Math.max(0, entry.duration - entry.time);
        return {
            percent,
            timeLeftLabel: formatTimeLeft(remaining),
            watched: Boolean(entry.watched),
        };
    }

    function formatTimeLeft(seconds: number) {
        if (seconds <= 30) return "Finishing up";
        const minutesTotal = Math.floor(seconds / 60);
        const hours = Math.floor(minutesTotal / 60);
        const minutes = minutesTotal % 60;

        if (hours > 0) {
            if (minutes === 0) return `${hours}h left`;
            return `${hours}h ${minutes}m left`;
        }

        if (minutes > 0) return `${minutes}m left`;
        return "Less than a minute left";
    }

    $: episodeProgressEntry = getProgressEntry();

    $: progressDetails = computeProgressDetails(episodeProgressEntry);

    onMount(() => {
        episodeProgressEntry = getProgressEntry();
        progressDetails = computeProgressDetails(episodeProgressEntry);
    });

    $: if (selectedEpisode) {
        if (progressSignature !== null) {
            episodeProgressEntry = getProgressEntry();
            progressDetails = computeProgressDetails(episodeProgressEntry);
        }
    }
 
    $: showEpisodeLabel =
        metaData?.meta?.type !== "movie" &&
        episodeSeasonNumber &&
        episodeNumber;

</script>

{#if streamsPopupVisible}
    <div
        use:portal
        class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 sm:p-10 lg:p-20"
        transition:fade={{ duration: 200 }}
        on:click|self={close}
        on:keydown={(e) => e.key === "Escape" && close()}
        on:wheel|preventDefault|stopPropagation
        role="button"
        tabindex="0"
    >
        <div
            class="bg-[#121212] w-full max-w-6xl max-h-full rounded-4xl p-6 sm:p-8 lg:p-10 flex flex-col gap-6 overflow-hidden relative"
            on:wheel|stopPropagation
        >
            <button
                class="absolute top-6 right-6 text-white/50 hover:text-white cursor-pointer"
                on:click={close}
                aria-label="Close streams"
            >
                <X size={24} color="currentColor" strokeWidth={2} />
            </button>

            <div class="flex flex-col lg:flex-row gap-8 flex-1 min-h-0">
                <aside
                    class="bg-[#1A1A1A] rounded-[28px] p-5 lg:p-6 flex flex-col gap-4 lg:w-[320px] xl:w-90 shrink-0 max-h-full overflow-y-auto"
                >
                    {#if selectedEpisode}
                        <div class="flex flex-col gap-4">
                            <div
                                class="relative w-full aspect-video rounded-2xl overflow-hidden border border-white/5 bg-[#0f0f0f]"
                            >
                                {#if detailsThumbnail && !thumbnailError}
                                    <img
                                        src={detailsThumbnail}
                                        alt="Episode artwork"
                                        class="w-full h-full object-cover"
                                        on:error={handleThumbnailError}
                                    />
                                {:else}
                                    <div
                                        class="w-full h-full flex items-center justify-center text-white/40 text-sm"
                                    >
                                        No artwork available
                                    </div>
                                {/if}

                                {#if progressDetails}
                                    <div
                                        class="absolute bottom-0 left-0 w-full p-3 bg-linear-to-t from-black/80 via-black/40 to-transparent flex flex-col gap-1.5 z-10"
                                    >
                                        <div
                                            class="flex items-center justify-between text-[10px] uppercase tracking-[0.35em] text-white/70"
                                        >
                                            <span>Resume</span>
                                            <span>{progressDetails.timeLeftLabel}</span>
                                        </div>
                                        <div
                                            class="h-1.5 bg-white/20 rounded-full overflow-hidden"
                                        >
                                            <div
                                                class="h-full bg-white rounded-full"
                                                style={`width: ${progressDetails.percent}%`}
                                            ></div>
                                        </div>
                                    </div>
                                {/if}
                            </div>

                            <div class="flex flex-col gap-3">
                                {#if showEpisodeLabel}
                                    <span
                                        class="text-xs uppercase tracking-[0.2em] text-white/50"
                                    >
                                        Season {episodeSeasonNumber} / Episode {episodeNumber}
                                    </span>
                                {/if}
                                <h3 class="text-white text-2xl font-semibold leading-tight">
                                    {episodeTitle}
                                </h3>
                                {#if episodeDescription}
                                    <p class="text-white/70 text-sm leading-relaxed">
                                        {episodeDescription}
                                    </p>
                                {/if}
                            </div>
                        </div>

                        {#if releaseInfo.absolute}
                            <div
                                class="pt-4 border-t border-white/5 flex flex-col gap-1"
                            >
                                <span
                                    class="text-[11px] uppercase tracking-[0.2em] text-white/40"
                                    >Released</span
                                >
                                <span class="text-white text-sm">
                                    {releaseInfo.absolute}
                                    {#if releaseInfo.relative}
                                        <span class="text-white/50">
                                            ({releaseInfo.relative})
                                        </span>
                                    {/if}
                                </span>
                            </div>
                        {/if}
                    {:else}
                        <div
                            class="flex flex-col items-center justify-center text-center text-white/60 text-sm h-full"
                        >
                            Select an episode to view details.
                        </div>
                    {/if}
                </aside>

                <section class="flex-1 flex flex-col gap-5 min-h-0">
                    <div class="flex flex-col gap-2">
                        <h2 class="text-white text-2xl font-poppins font-bold">
                            Select Stream
                        </h2>
                        <p class="text-white/60 text-sm">
                            Pick a source to start watching. Some sources may take longer to load.
                        </p>
                    </div>

                    {#if filteredAddons.length > 1}
                        <div class="flex flex-wrap gap-3 pb-1">
                            {#each filteredAddons as addon}
                                <button
                                    type="button"
                                    class="px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer whitespace-nowrap {selectedAddon ===
                                    addon.transport_url
                                        ? 'bg-white text-black shadow-lg shadow-white/10'
                                        : 'bg-white/10 text-white/70 hover:bg-white/20'}"
                                    on:click={() => selectAddon(addon)}
                                >
                                    {addon.manifest.name}
                                </button>
                            {/each}
                        </div>
                    {/if}

                    <div
                        class="bg-white/5 rounded-2xl border border-white/5 p-4 flex flex-col gap-3"
                    >
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="text-white/70 text-sm font-semibold">
                                Resolution
                            </span>
                            <div class="flex flex-wrap gap-2">
                                {#each RESOLUTION_FILTERS as option}
                                    <button
                                        type="button"
                                        class="px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide uppercase transition-colors duration-200 {resolutionFilter ===
                                        option.value
                                            ? 'bg-white text-black shadow shadow-white/40'
                                            : 'bg-white/10 text-white/70 hover:bg-white/20 cursor-pointer'}"
                                        on:click={() =>
                                            setResolutionFilter(option.value)}
                                    >
                                        {option.label}
                                    </button>
                                {/each}
                            </div>
                        </div>
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="text-white/70 text-sm font-semibold">
                                HDR
                            </span>
                            <button
                                type="button"
                                class="px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide uppercase transition-colors duration-200 cursor-pointer {excludeHDR
                                    ? 'bg-[#FFDD57] text-black'
                                    : 'bg-white/10 text-white/70 hover:bg-white/20'}"
                                on:click={toggleExcludeHDR}
                            >
                                {excludeHDR ? "Excluded" : "Include"}
                            </button>
                            {#if filtersActive}
                                <button
                                    type="button"
                                    class="ml-auto text-xs text-white/50 hover:text-white/80 underline decoration-dotted cursor-pointer"
                                    on:click={resetFilters}
                                >
                                    Reset filters
                                </button>
                            {/if}
                        </div>
                    </div>

                    <div
                        class="flex flex-col gap-4 overflow-y-auto pr-1 flex-1 min-h-0"
                    >
                        {#if loadingStreams}
                            <div class="flex justify-center py-10">
                                <LoadingSpinner size="40px" />
                            </div>
                        {:else if filteredStreams.length === 0}
                            <div class="text-white/50 text-center py-10">
                                {streams.length === 0
                                    ? "No streams found."
                                    : "No streams match the current filters."}
                            </div>
                        {:else}
                            {#if localFilteredStreams.length}
                                <div class="flex items-center justify-between">
                                    <span class="text-white/60 text-xs font-semibold tracking-[0.25em] uppercase">
                                        Local
                                    </span>
                                </div>
                                {#each localFilteredStreams as item (item.key)}
                                    <button
                                        class="w-full bg-[#1A1A1A] hover:bg-[#222] p-5 rounded-2xl flex flex-col gap-3 text-left transition-all duration-200 cursor-pointer"
                                        on:click={() => onStreamClick(item.stream)}
                                    >
                                        <div class="flex flex-row justify-between items-start w-full gap-4">
                                            <div class="flex flex-col gap-1">
                                                <span class="text-white text-lg font-semibold">
                                                    {item.meta.providerLabel}
                                                </span>

                                                {#if item.meta.infoLine}
                                                    <span class="text-[10px] uppercase tracking-[0.4em] text-white/40">
                                                        {item.meta.infoLine}
                                                    </span>
                                                {/if}
                                            </div>
                                            {#if item.meta.statusBadges.length}
                                                <div class="flex flex-wrap gap-2 justify-end">
                                                    {#each item.meta.statusBadges as badge (badge.label)}
                                                        <span
                                                            class={`px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase ${badge.variant ===
                                                            'accent'
                                                                ? 'bg-white text-black'
                                                                : 'border border-white/20 text-white/80'}`}
                                                        >
                                                            {badge.label}
                                                        </span>
                                                    {/each}
                                                </div>
                                            {/if}
                                        </div>

                                        {#if item.meta.featureBadges.length}
                                            <div class="flex flex-wrap gap-2">
                                                {#each item.meta.featureBadges as badge (badge.label)}
                                                    <span
                                                        class={`px-3 py-1 rounded-full text-xs font-medium tracking-wide ${badge.variant ===
                                                        'accent'
                                                            ? 'bg-white text-black'
                                                            : badge.variant ===
                                                        'muted'
                                                            ? 'bg-white/5 text-white/50'
                                                            : 'bg-white/10 text-white'}`}
                                                    >
                                                        {badge.label}
                                                    </span>
                                                {/each}
                                            </div>
                                        {/if}
                                    </button>
                                {/each}

                                {#if addonFilteredStreams.length}
                                    <div class="h-px bg-white/10"></div>
                                {/if}
                            {/if}

                            {#if addonFilteredStreams.length}
                                <div class="flex items-center justify-between">
                                    <span class="text-white/60 text-xs font-semibold tracking-[0.25em] uppercase">
                                        {addonFilteredStreams.length} Source{addonFilteredStreams.length > 1 ? 's' : ''}
                                    </span>
                                </div>
                                {#each addonFilteredStreams as item (item.key)}
                                    <button
                                        class="w-full bg-[#1A1A1A] hover:bg-[#222] p-5 rounded-2xl flex flex-col gap-3 text-left transition-all duration-200 cursor-pointer"
                                        on:click={() => onStreamClick(item.stream)}
                                    >
                                        <div class="flex flex-row justify-between items-start w-full gap-4">
                                            <div class="flex flex-col gap-1">
                                                <span class="text-white text-lg font-semibold">
                                                    {item.meta.providerLabel}
                                                </span>

                                                {#if item.meta.infoLine}
                                                    <span class="text-[10px] uppercase tracking-[0.4em] text-white/40">
                                                        {item.meta.infoLine}
                                                    </span>
                                                {/if}

                                                {#if item.meta.isP2P && item.meta.peerCount != null}
                                                    <span class="flex items-center gap-2 text-xs text-white/70">
                                                        <Link2 size={14} color="currentColor" strokeWidth={2} />
                                                        <span>{item.meta.peerCount} peers online</span>
                                                    </span>
                                                {/if}
                                            </div>
                                            {#if item.meta.statusBadges.length}
                                                <div class="flex flex-wrap gap-2 justify-end">
                                                    {#each item.meta.statusBadges as badge (badge.label)}
                                                        <span
                                                            class={`px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase ${badge.variant ===
                                                            'accent'
                                                                ? 'bg-white text-black'
                                                                : 'border border-white/20 text-white/80'}`}
                                                        >
                                                            {badge.label}
                                                        </span>
                                                    {/each}
                                                </div>
                                            {/if}
                                        </div>

                                        {#if item.meta.featureBadges.length}
                                            <div class="flex flex-wrap gap-2">
                                                {#each item.meta.featureBadges as badge (badge.label)}
                                                    <span
                                                        class={`px-3 py-1 rounded-full text-xs font-medium tracking-wide ${badge.variant ===
                                                        'accent'
                                                            ? 'bg-white text-black'
                                                            : badge.variant ===
                                                        'muted'
                                                            ? 'bg-white/5 text-white/50'
                                                            : 'bg-white/10 text-white'}`}
                                                    >
                                                        {badge.label}
                                                    </span>
                                                {/each}
                                            </div>
                                        {/if}
                                    </button>
                                {/each}
                            {/if}
                        {/if}
                    </div>
                </section>
            </div>
        </div>
    </div>
{/if}
