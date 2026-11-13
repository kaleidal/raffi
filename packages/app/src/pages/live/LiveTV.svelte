<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { RotateCw } from "@lucide/svelte";
    import SearchBar from "../../components/home/SearchBar.svelte";
    import SettingsModal from "../../components/home/modals/SettingsModal.svelte";
    import LoadingSpinner from "../../components/common/LoadingSpinner.svelte";
    import TopGlow from "../../components/common/TopGlow.svelte";
    import SourcePicker from "./components/SourcePicker.svelte";
    import GroupPicker from "./components/GroupPicker.svelte";
    import ChannelMenu from "./components/ChannelMenu.svelte";
    import ChannelGrid from "./components/ChannelGrid.svelte";
    import ChannelGuide from "./guide/ChannelGuide.svelte";
    import SourcesModal from "./sources/SourcesModal.svelte";
    import LiveEmpty from "./components/LiveEmpty.svelte";
    import { router } from "../../lib/stores/router";
    import { channelQuery, closeLibrary, library, openSource, zapOrder } from "../../lib/live/library";
    import { filterChannels, groupChoices } from "../../lib/live/lineup";
    import { ALL_CHANNELS, FAVOURITES, lastLiveGroups, lastLiveSource, liveLayout } from "../../lib/live/preferences";
    import { liveSettings, loadLiveSettings, toggleFavourite } from "../../lib/live/sources";
    import type { LiveChannel, LiveSource } from "../../lib/live/types";

    const CLOCK_TICK_MS = 30_000;

    let showSources = false;
    let showSettings = false;
    let settingsLoaded = false;
    let now = Date.now();
    let menu: { x: number; y: number; channel: LiveChannel } | null = null;

    $: sources = $liveSettings.sources;
    $: source = $library.source;
    $: lineup = $library.lineup;
    $: favourites = new Set($liveSettings.favourites);
    $: hasFavourites = Boolean(lineup?.channels.some((channel) => favourites.has(channel.id)));
    $: groups = lineup ? groupChoices(lineup.groups, hasFavourites) : [];
    $: storedGroup = source ? $lastLiveGroups[source.id] : undefined;
    $: group = storedGroup && groups.includes(storedGroup) ? storedGroup : hasFavourites ? FAVOURITES : ALL_CHANNELS;
    $: channels = lineup ? filterChannels(lineup.channels, group, $channelQuery, favourites) : [];
    $: counts = groupCounts(lineup?.channels ?? [], favourites);
    $: hasGuide = Boolean(lineup?.channels.some((channel) => channel.guideId));
    $: layout = $liveLayout === "auto" ? (hasGuide ? "guide" : "grid") : $liveLayout;

    function groupCounts(list: LiveChannel[], favourite: Set<string>) {
        const result = new Map<string, number>([[ALL_CHANNELS, list.length]]);
        for (const channel of list) {
            result.set(channel.group, (result.get(channel.group) ?? 0) + 1);
            if (favourite.has(channel.id)) result.set(FAVOURITES, (result.get(FAVOURITES) ?? 0) + 1);
        }
        return result;
    }

    function select(next: LiveSource, force = false) {
        lastLiveSource.set(next.id);
        channelQuery.set("");
        void openSource(next, { force });
    }

    function chooseGroup(next: string) {
        if (!source) return;
        lastLiveGroups.update((stored) => ({ ...stored, [source.id]: next }));
    }

    function play(channel: LiveChannel) {
        if (!source) return;
        zapOrder.set(channels);
        router.navigate("live-player", { sourceId: source.id, channelId: channel.id });
    }

    function showMenu(event: MouseEvent, channel: LiveChannel) {
        menu = { x: event.clientX, y: event.clientY, channel };
    }

    function removed(sourceId: string) {
        if (source?.id !== sourceId) return;
        const next = $liveSettings.sources[0];
        if (next) select(next);
        else closeLibrary();
    }

    onMount(() => {
        channelQuery.set("");
        void loadLiveSettings().then((settings) => {
            settingsLoaded = true;
            const remembered = settings.sources.find((entry) => entry.id === $lastLiveSource) ?? settings.sources[0];
            if (remembered) select(remembered);
        });
        const clock = setInterval(() => (now = Date.now()), CLOCK_TICK_MS);
        return () => clearInterval(clock);
    });

    onDestroy(() => channelQuery.set(""));
</script>

<SettingsModal bind:showSettings />
<SourcesModal bind:open={showSources} onSaved={(saved) => select(saved, true)} onRemoved={removed} />

{#if menu}
    <ChannelMenu
        x={menu.x}
        y={menu.y}
        favourite={favourites.has(menu.channel.id)}
        onToggleFavourite={() => menu && toggleFavourite(menu.channel.id)}
        onClose={() => (menu = null)}
    />
{/if}

<div class="relative flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-[#090909]">
    <SearchBar absolute={false} onOpenSettings={() => (showSettings = true)}>
        <SourcePicker
            slot="leading"
            {sources}
            activeId={source?.id}
            onSelect={(next) => select(next)}
            onManage={() => (showSources = true)}
        />
    </SearchBar>

    <TopGlow color="#C8D3E6" opacity={0.42} />

    <div class="relative z-10 flex min-h-0 flex-1 flex-col gap-[clamp(14px,1.4vw,24px)] px-[var(--raffi-page-gutter)] pt-[clamp(8px,1vw,16px)]">
        {#if !settingsLoaded}
            <div class="flex flex-1 items-center justify-center"><LoadingSpinner size="60px" /></div>
        {:else if !sources.length}
            <LiveEmpty title="Watch live TV" actionLabel="Add a source" onAction={() => (showSources = true)}>
                Add an M3U playlist or an Xtream Codes account.
            </LiveEmpty>
        {:else if !lineup}
            {#if $library.error}
                <LiveEmpty title="Couldn't load channels" actionLabel="Try again" onAction={() => source && select(source, true)}>
                    {$library.error}
                </LiveEmpty>
            {:else}
                <div class="flex flex-1 items-center justify-center"><LoadingSpinner size="60px" /></div>
            {/if}
        {:else}
            <div class="flex items-center justify-between gap-4" in:fade={{ duration: 200 }}>
                <GroupPicker {groups} value={group} {counts} onChange={chooseGroup} />
                <div class="flex min-w-0 items-center gap-3 font-poppins text-sm text-white/45">
                    {#if $library.loading || $library.guideLoading}
                        <LoadingSpinner size="16px" color="#9A9A9A" />
                        <span class="truncate">{$library.loading ? "Updating channels" : "Loading guide"}</span>
                    {:else if $library.error || $library.guideError}
                        <span class="truncate text-white/40" title={$library.error ?? $library.guideError}>
                            {$library.error ? "Couldn't update channels" : "Guide unavailable"}
                        </span>
                    {/if}
                    <button
                        class="rounded-full p-2 text-white/45 hover:bg-white/10 hover:text-white cursor-pointer disabled:opacity-40"
                        aria-label="Refresh"
                        disabled={$library.loading || $library.guideLoading}
                        onclick={() => source && select(source, true)}
                    >
                        <RotateCw size={18} strokeWidth={2} />
                    </button>
                </div>
            </div>

            <div class="min-h-0 flex-1" in:fade={{ duration: 200 }}>
                {#if channels.length === 0}
                    <p class="pt-16 text-center font-poppins text-white/45">No channels match.</p>
                {:else}
                    {#key `${source?.id}:${group}:${$channelQuery}:${layout}`}
                        {#if layout === "guide"}
                            <ChannelGuide {channels} {now} onPlay={play} onMenu={showMenu} />
                        {:else}
                            <ChannelGrid {channels} {now} onPlay={play} onMenu={showMenu} />
                        {/if}
                    {/key}
                {/if}
            </div>
        {/if}
    </div>
</div>
