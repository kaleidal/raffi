<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import CustomSelect from "../../../common/CustomSelect.svelte";
    import { trackEvent } from "../../../../lib/analytics";
    import {
        DIRECT_SOURCE_DEFAULTS,
        getStreamingSourceSettings,
        saveStreamingSourceSettings,
        type DirectIdType,
        type DirectPlaybackMode,
        type DirectPlayerFormat,
        type DirectSourceConfig,
        type StreamingSourceMode,
        type StreamingSourceSettings,
    } from "../../../../lib/streaming/sourceSettings";

    const sourceModeOptions: Array<{ label: string; value: StreamingSourceMode }> = [
        { label: "Addons", value: "addons" },
        { label: "Direct", value: "direct" },
    ];

    const idTypeOptions: Array<{ label: string; value: DirectIdType }> = [
        { label: "TMDB", value: "tmdb" },
        { label: "IMDb", value: "imdb" },
    ];

    const playbackModeOptions: Array<{ label: string; value: DirectPlaybackMode }> = [
        { label: "Iframe", value: "iframe" },
        { label: "Raffi player", value: "player" },
    ];

    const playerFormatOptions: Array<{ label: string; value: DirectPlayerFormat }> = [
        { label: "Auto", value: "auto" },
        { label: "HLS", value: "hls" },
        { label: "MP4", value: "mp4" },
        { label: "WebM", value: "webm" },
        { label: "DASH", value: "dash" },
        { label: "Other", value: "other" },
    ];

    type CommunityTemplate = {
        name: string;
        movieUrl: string;
        seriesUrl: string;
    };

    const communityTemplates: CommunityTemplate[] = [
        {
            name: "Videasy",
            movieUrl: "https://player.videasy.net/movie/[tmdb_id]?progress=[progress]",
            seriesUrl: "https://player.videasy.net/tv/[tmdb_id]/[season]/[episode]?t=[progress]",
        },
        {
            name: "Vidlink",
            movieUrl: "https://vidlink.pro/movie/[tmdb_id]?startAt=[progress]",
            seriesUrl: "https://vidlink.pro/tv/[tmdb_id]/[season]/[episode]?startAt=[progress]",
        },
        {
            name: "VidSrc",
            movieUrl: "https://vidsrc.to/embed/movie/[tmdb_id]",
            seriesUrl: "https://vidsrc.to/embed/tv/[tmdb_id]/[season]/[episode]",
        },
    ];

    let settings = $state<StreamingSourceSettings>({
        mode: DIRECT_SOURCE_DEFAULTS.mode,
        direct: { ...DIRECT_SOURCE_DEFAULTS.direct },
    });
    let loaded = $state(false);
    let saveState = $state<"idle" | "saving" | "saved" | "error">("idle");
    let saveTimeout: ReturnType<typeof setTimeout> | null = null;
    let savedTimeout: ReturnType<typeof setTimeout> | null = null;
    let movieTemplateReady = $derived(
        settings.direct.movieUrl.includes("[id]") ||
            settings.direct.movieUrl.includes("[tmdb_id]") ||
            settings.direct.movieUrl.includes("[imdb_id]"),
    );
    let seriesTemplateReady = $derived(
        (
            settings.direct.seriesUrl.includes("[id]") ||
            settings.direct.seriesUrl.includes("[tmdb_id]") ||
            settings.direct.seriesUrl.includes("[imdb_id]")
        ) &&
            settings.direct.seriesUrl.includes("[season]") &&
            settings.direct.seriesUrl.includes("[episode]"),
    );

    onMount(() => {
        void loadSettings();
    });

    onDestroy(() => {
        if (saveTimeout) clearTimeout(saveTimeout);
        if (savedTimeout) clearTimeout(savedTimeout);
    });

    async function loadSettings() {
        settings = await getStreamingSourceSettings();
        loaded = true;
    }

    function cloneWith(
        updates: Partial<Omit<StreamingSourceSettings, "direct">> & {
            direct?: Partial<DirectSourceConfig>;
        },
    ) {
        settings = {
            ...settings,
            ...updates,
            direct: {
                ...settings.direct,
                ...(updates.direct || {}),
            },
        };
    }

    function scheduleSave() {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveState = "saving";
        saveTimeout = setTimeout(() => {
            void persistSettings();
        }, 450);
    }

    async function persistSettings() {
        if (saveTimeout) {
            clearTimeout(saveTimeout);
            saveTimeout = null;
        }

        try {
            settings = await saveStreamingSourceSettings(settings);
            saveState = "saved";
            if (savedTimeout) clearTimeout(savedTimeout);
            savedTimeout = setTimeout(() => {
                saveState = "idle";
            }, 1600);
        } catch (error) {
            console.error("Failed to save streaming source settings", error);
            saveState = "error";
        }
    }

    function setMode(mode: StreamingSourceMode) {
        if (settings.mode === mode) return;
        cloneWith({ mode });
        void persistSettings();
        trackEvent("streaming_source_mode_changed", { mode });
    }

    function updateDirect(updates: Partial<StreamingSourceSettings["direct"]>) {
        cloneWith({ direct: updates });
        scheduleSave();
    }

    function setDirect(updates: Partial<StreamingSourceSettings["direct"]>) {
        cloneWith({ direct: updates });
        void persistSettings();
    }

    // Live state update only (no save) — used for long URL fields while typing
    function updateDirectLive(updates: Partial<StreamingSourceSettings["direct"]>) {
        cloneWith({ direct: updates });
    }

    function handleInput(event: Event, key: "displayName" | "movieUrl" | "seriesUrl") {
        updateDirect({ [key]: (event.target as HTMLInputElement).value });
    }

    function handleUrlInput(event: Event, key: "movieUrl" | "seriesUrl") {
        updateDirectLive({ [key]: (event.target as HTMLInputElement).value });
    }

    function saveOnUrlBlur() {
        // User finished editing the template — persist now
        void persistSettings();
    }

    function applyTemplate(template: CommunityTemplate) {
        const isDefaultName =
            !settings.direct.displayName ||
            settings.direct.displayName === DIRECT_SOURCE_DEFAULTS.direct.displayName;

        updateDirect({
            displayName: isDefaultName ? template.name : settings.direct.displayName,
            movieUrl: template.movieUrl,
            seriesUrl: template.seriesUrl,
        });

        trackEvent("direct_source_example_applied", { name: template.name });
    }

</script>

<div class="rounded-2xl bg-white/8 p-4 flex flex-col gap-4">
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div class="min-w-0">
            <p class="text-white font-medium">Streaming Source</p>
            <p class="text-white/60 text-sm">
                Switch between installed addons and a custom link template.
            </p>
        </div>

        <div class="flex rounded-full bg-white/8 p-1">
            {#each sourceModeOptions as option (option.value)}
                <button
                    type="button"
                    class="rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200 cursor-pointer {settings.mode === option.value
                        ? 'bg-white text-black'
                        : 'text-white/65 hover:text-white'}"
                    onclick={() => setMode(option.value)}
                    disabled={!loaded}
                >
                    {option.label}
                </button>
            {/each}
        </div>
    </div>

    {#if settings.mode === "direct"}
        <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_132px_160px]">
            <label class="flex min-w-0 flex-col gap-2">
                <span class="text-xs text-white/45">Name</span>
                <input
                    type="text"
                    value={settings.direct.displayName}
                    placeholder="Direct link"
                    class="min-h-11 rounded-2xl bg-white/8 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:bg-white/12"
                    oninput={(event) => handleInput(event, "displayName")}
                />
            </label>

            <label class="flex min-w-0 flex-col gap-2">
                <span class="text-xs text-white/45">ID</span>
                <CustomSelect
                    value={settings.direct.idType}
                    options={idTypeOptions}
                    buttonClass="min-h-11 rounded-2xl bg-white/8 px-4 text-sm text-white hover:bg-white/12"
                    menuClass="min-w-[132px]"
                    on:change={(event) => setDirect({ idType: event.detail.value as DirectIdType })}
                />
            </label>

            <label class="flex min-w-0 flex-col gap-2">
                <span class="text-xs text-white/45">Playback</span>
                <CustomSelect
                    value={settings.direct.playbackMode}
                    options={playbackModeOptions}
                    buttonClass="min-h-11 rounded-2xl bg-white/8 px-4 text-sm text-white hover:bg-white/12"
                    menuClass="min-w-[180px]"
                    on:change={(event) => setDirect({ playbackMode: event.detail.value as DirectPlaybackMode })}
                />
            </label>
        </div>

        <label class="flex min-w-0 flex-col gap-2">
            <span class="text-xs text-white/45">Movie URL</span>
            <input
                type="text"
                value={settings.direct.movieUrl}
                placeholder="https://example.com/movie/[id]?progress=[progress]"
                class="min-h-11 rounded-2xl bg-white/8 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:bg-white/12"
                oninput={(event) => handleUrlInput(event, "movieUrl")}
                onblur={saveOnUrlBlur}
            />
        </label>

        <label class="flex min-w-0 flex-col gap-2">
            <span class="text-xs text-white/45">Series URL</span>
            <input
                type="text"
                value={settings.direct.seriesUrl}
                placeholder="https://example.com/tv/[id]/[season]/[episode]?t=[progress]"
                class="min-h-11 rounded-2xl bg-white/8 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:bg-white/12"
                oninput={(event) => handleUrlInput(event, "seriesUrl")}
                onblur={saveOnUrlBlur}
            />
        </label>

        {#if settings.direct.playbackMode === "player"}
            <div class="max-w-[220px]">
                <label class="flex min-w-0 flex-col gap-2">
                    <span class="text-xs text-white/45">Format</span>
                    <CustomSelect
                        value={settings.direct.playerFormat}
                        options={playerFormatOptions}
                        buttonClass="min-h-11 rounded-2xl bg-white/8 px-4 text-sm text-white hover:bg-white/12"
                        menuClass="min-w-[180px]"
                        on:change={(event) => setDirect({ playerFormat: event.detail.value as DirectPlayerFormat })}
                    />
                </label>
            </div>
        {/if}

        <div class="rounded-2xl bg-black/16 px-4 py-3 text-sm text-white/60">
            Tokens: [id], [tmdb_id], [imdb_id], [season], [episode], [season_padded], [episode_padded], [progress], [type]
        </div>

        {#if communityTemplates.length > 0}
            <div class="flex flex-col gap-1.5">
                <div class="text-xs text-white/45">Community examples</div>
                {#each communityTemplates as template (template.name)}
                    <div
                        class="group flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2 transition-colors hover:bg-white/8"
                        role="button"
                        tabindex="0"
                        onclick={() => applyTemplate(template)}
                        onkeydown={(e) => (e.key === "Enter" || e.key === " ") && applyTemplate(template)}
                    >
                        <div class="min-w-0">
                            <div class="text-sm font-medium text-white/90">{template.name}</div>
                            <div class="text-[10px] text-white/40 truncate">{template.movieUrl}</div>
                        </div>
                        <div
                            class="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs text-white/80 transition-colors group-hover:bg-white/15 group-active:bg-white/20"
                        >
                            Use
                        </div>
                    </div>
                {/each}
                <div class="text-[10px] text-white/30">
                    Unofficial third-party players. Availability can change.
                </div>
            </div>
        {/if}

        {#if !movieTemplateReady || !seriesTemplateReady || saveState !== "idle"}
            <div class="flex flex-wrap gap-2 text-sm">
                {#if !movieTemplateReady}
                    <span class="text-[#FFDD57]">Movie URL needs an ID token.</span>
                {/if}
                {#if !seriesTemplateReady}
                    <span class="text-[#FFDD57]">Series URL needs ID, season, and episode tokens.</span>
                {/if}
                {#if saveState === "saving"}
                    <span class="text-white/50">Saving...</span>
                {:else if saveState === "saved"}
                    <span class="text-white/50">Saved.</span>
                {:else if saveState === "error"}
                    <span class="text-red-300">Could not save settings.</span>
                {/if}
            </div>
        {/if}
    {/if}
</div>
