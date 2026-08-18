<script lang="ts">
    import { fade, scale } from "svelte/transition";
    import { onMount } from "svelte";

    import * as Subtitles from "../../pages/player/subtitles";

    const portal = (node: HTMLElement) => {
        if (typeof document === "undefined") {
            return { destroy() {} };
        }
        const target = document.fullscreenElement || document.body;
        target.appendChild(node);
        return {
            destroy() {
                if (node.parentNode) {
                    node.parentNode.removeChild(node);
                }
            },
        };
    };


    export let title: string;
    export let kind: "audio" | "subtitles" = title === "Subtitles" ? "subtitles" : "audio";
    export let tracks: {
        id: string | number;
        label: string;
        selected?: boolean;
        group?: string;
        lang?: string;
        url?: string;
        isAddon?: boolean;
        isLocal?: boolean;
        isEmbedded?: boolean;
        format?: "vtt" | "srt";
    }[];

    export let onSelect: (track: any) => void = () => {};
    export let onUpload: (file: File) => void | Promise<void> = () => {};
    export let onClose: () => void = () => {};
    export let onDelayChange: (detail: { seconds: number }) => void = () => {};

    function select(track: any) {
        onSelect(track);
        onClose();
    }

    function selectWithoutClose(track: any) {
        onSelect(track);
    }

    function close() {
        onClose();
    }

    // Group tracks if needed
    $: groupedTracks = tracks.reduce(
        (acc, track) => {
            const group = track.group || "Default";
            if (!acc[group]) acc[group] = [];
            acc[group].push(track);
            return acc;
        },
        {} as Record<string, typeof tracks>,
    );

    function normalizeLang(lang?: string) {
        const s = (lang || "").trim();
        return s ? s.toLowerCase() : "und";
    }

    function subtitleLanguage(track: (typeof tracks)[number]) {
        return track.isLocal ? "local" : normalizeLang(track.lang);
    }

    $: subtitleOffTrack = tracks.find((t) => String(t.id) === "off") || null;

    $: subtitleTracksOnly = tracks.filter((t) => String(t.id) !== "off");

    $: subtitleLanguages = Array.from(
        new Set(subtitleTracksOnly.map(subtitleLanguage)),
    ).sort();

    let languageQuery = "";
    $: filteredSubtitleLanguages = subtitleLanguages.filter((lang) => {
        const q = languageQuery.trim().toLowerCase();
        if (!q) return true;
        if (lang.includes(q)) return true;

        // Also match any variant label for that language.
        return subtitleTracksOnly
            .filter((t) => subtitleLanguage(t) === lang)
            .some((t) => (t.label || "").toLowerCase().includes(q));
    });

    let selectedSubtitleLanguage: string | null = null;
    let userPinnedLanguage = false;
    let lastSelectedSubtitleId: string | number | null = null;
    $: {
        // Default to the currently selected subtitle track's language, but don't
        // override if the user is browsing other languages.
        const selected = subtitleTracksOnly.find((t) => t.selected);
        const selectedId = selected?.id ?? null;
        const selectedLang = selected ? subtitleLanguage(selected) : null;

        // If selection changed (e.g. user selected a different subtitle), re-sync.
        if (selectedId !== lastSelectedSubtitleId) {
            lastSelectedSubtitleId = selectedId;
            userPinnedLanguage = false;
        }

        if (!userPinnedLanguage && selectedLang && subtitleLanguages.includes(selectedLang)) {
            selectedSubtitleLanguage = selectedLang;
        }

        // Avoid preselecting a language when no subtitle is selected (Off).
        if (selectedSubtitleLanguage && !subtitleLanguages.includes(selectedSubtitleLanguage)) {
            selectedSubtitleLanguage = null;
        }
    }

    $: subtitleVariants = selectedSubtitleLanguage
        ? subtitleTracksOnly.filter(
              (t) => subtitleLanguage(t) === selectedSubtitleLanguage,
          )
        : [];

    let subtitleFileInput: HTMLInputElement;
    let uploadError = "";
    let uploadInProgress = false;

    async function uploadSubtitle(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (!file) return;

        uploadError = "";
        uploadInProgress = true;
        try {
            await onUpload(file);
            onClose();
        } catch (error) {
            uploadError = error instanceof Error
                ? error.message
                : "Could not upload this subtitle file.";
        } finally {
            uploadInProgress = false;
        }
    }

    let delaySeconds = 0;
    onMount(() => {
        if (kind === "subtitles") {
            delaySeconds = Subtitles.getSubtitleDelaySeconds();
        }
    });

    function setDelay(next: number) {
        // Clamp to a sane range to avoid accidental huge offsets.
        const clamped = Math.max(-30, Math.min(30, Number(next)));
        delaySeconds = Number.isFinite(clamped) ? clamped : 0;
        Subtitles.setSubtitleDelaySeconds(delaySeconds);
        onDelayChange({ seconds: delaySeconds });
    }

</script>

<div
    use:portal
    class="raffi-modal-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-[#0f0f0f]/58 backdrop-blur-xl cursor-default"
    transition:fade={{ duration: 200 }}
    on:click={close}
    on:keydown={(e) => e.key === "Escape" && close()}
    role="button"
    tabindex="0"
    aria-label="Close modal"
>
    <div
        class="raffi-modal-surface w-full rounded-[clamp(24px,2vw,32px)] bg-[#2a2a2a]/56 backdrop-blur-[40px] p-[clamp(18px,2vw,32px)] overflow-y-auto flex flex-col gap-[clamp(16px,1.5vw,24px)] shadow-[0_40px_160px_rgba(0,0,0,0.45)] {kind === 'subtitles'
            ? 'max-w-[680px]'
            : 'max-w-[400px]'}"
        transition:scale={{ duration: 200, start: 0.9 }}
        on:click|stopPropagation
        on:keydown|stopPropagation
        role="dialog"
        tabindex="-1"
    >

        <div class="flex items-center justify-between">
            <div class="flex flex-col gap-1">
                <h2 class="text-2xl font-poppins font-bold text-white">{title}</h2>
                <p class="text-sm text-white/55">
                    {kind === "subtitles"
                        ? "Pick a subtitle track, fine-tune timing, or add a local file."
                        : "Choose the audio track you want to hear."}
                </p>
            </div>
            <button
                class="p-2 text-white/50 hover:text-white transition-colors cursor-pointer"
                on:click={close}
                aria-label="Close"
            >
                <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    class="cursor-pointer"
                >
                    <path
                        d="M18 6L6 18M6 6L18 18"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                    />
                </svg>
            </button>
        </div>

        {#if kind === "subtitles"}
            <div class="flex flex-col gap-4">
                <div class="rounded-[24px] bg-white/8 backdrop-blur-2xl p-4 flex items-center justify-between gap-4">
                    <span class="text-sm font-poppins font-medium text-white/60 shrink-0">
                        Delay
                    </span>
                    <div class="flex flex-wrap items-center justify-end gap-2">
                        <button
                            type="button"
                            class="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors duration-200 cursor-pointer bg-white/10 text-white/70 hover:bg-white/20"
                            on:click={() => setDelay(delaySeconds - 0.25)}
                        >
                            -0.25s
                        </button>
                        <span class="text-xs text-white/70 w-[72px] text-center">
                            {delaySeconds.toFixed(2)}s
                        </span>
                        <button
                            type="button"
                            class="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors duration-200 cursor-pointer bg-white/10 text-white/70 hover:bg-white/20"
                            on:click={() => setDelay(delaySeconds + 0.25)}
                        >
                            +0.25s
                        </button>
                        <button
                            type="button"
                            class="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors duration-200 cursor-pointer bg-white/10 text-white/70 hover:bg-white/20"
                            on:click={() => setDelay(0)}
                        >
                            Reset
                        </button>
                    </div>
                </div>

                <div class="grid gap-3 md:grid-cols-[200px_minmax(0,1fr)] md:h-[440px]">
                        <div class="rounded-[24px] bg-white/6 backdrop-blur-2xl p-3 flex min-h-0 flex-col gap-3">
                            <h3 class="text-sm font-poppins font-medium text-white/45">
                                Languages
                            </h3>
                            <input
                                class="w-full px-3 py-2 rounded-xl bg-white/8 text-white/80 placeholder-white/30 text-sm outline-none focus:bg-white/12"
                                placeholder="Search"
                                bind:value={languageQuery}
                            />
                            <div class="min-h-0 overflow-y-auto pr-1 pb-3 flex flex-col gap-2">
                                {#each filteredSubtitleLanguages as lang}
                                    <button
                                        type="button"
                                        class="flex items-center justify-between p-3 rounded-xl transition-all duration-200 cursor-pointer {selectedSubtitleLanguage ===
                                        lang
                                            ? 'bg-white text-black'
                                            : 'bg-white/8 text-white hover:bg-white/14'}"
                                        on:click={() => {
                                            selectedSubtitleLanguage = lang;
                                            userPinnedLanguage = true;
                                        }}
                                    >
                                        <span class="font-poppins font-medium">
                                            {lang.toUpperCase()}
                                        </span>
                                        <span class="text-xs opacity-70">
                                            {subtitleTracksOnly.filter((t) =>
                                                subtitleLanguage(t) === lang,
                                            ).length}
                                        </span>
                                    </button>
                                {/each}
                            </div>
                            <input
                                class="hidden"
                                type="file"
                                accept=".srt,.vtt,application/x-subrip,text/vtt"
                                bind:this={subtitleFileInput}
                                on:change={uploadSubtitle}
                            />
                            <button
                                type="button"
                                class="flex w-full items-center gap-2 rounded-xl bg-white/8 px-3 py-2.5 text-sm font-poppins font-medium text-white/80 transition-colors hover:bg-white/14 disabled:cursor-wait disabled:opacity-50 cursor-pointer"
                                disabled={uploadInProgress}
                                on:click={() => subtitleFileInput?.click()}
                            >
                                <svg
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                >
                                    <path d="M12 5v14M5 12h14" />
                                </svg>
                                <span>{uploadInProgress ? "Loading…" : "Upload subtitle"}</span>
                            </button>
                            {#if uploadError}
                                <p class="px-1 text-xs leading-5 text-red-300">
                                    {uploadError}
                                </p>
                            {/if}
                        </div>

                        <div class="rounded-[24px] bg-white/6 backdrop-blur-2xl p-3 flex min-h-0 flex-col gap-3 min-w-0">
                            <h3 class="text-sm font-poppins font-medium text-white/45">
                                Variants
                            </h3>
                            <div class="min-h-0 overflow-y-auto pr-1 pb-3 flex flex-col gap-2">
                                {#if subtitleOffTrack}
                                    <button
                                        class="flex items-center justify-between p-4 rounded-[20px] transition-all duration-200 cursor-pointer {subtitleOffTrack.selected
                                            ? 'bg-white text-black'
                                            : 'bg-white/8 text-white hover:bg-white/14'}"
                                        on:click={() => select(subtitleOffTrack)}
                                    >
                                        <span class="font-poppins font-medium truncate" title={subtitleOffTrack.label}>
                                            {subtitleOffTrack.label}
                                        </span>
                                        {#if subtitleOffTrack.selected}
                                            <svg
                                                width="20"
                                                height="20"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="3"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                            >
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                        {/if}
                                    </button>
                                {/if}

                                {#if !selectedSubtitleLanguage}
                                    <div class="text-white/50 text-sm p-3">
                                        Pick a language.
                                    </div>
                                {:else if subtitleVariants.length === 0}
                                    <div class="text-white/50 text-sm p-3">
                                        No variants.
                                    </div>
                                {:else}
                                    {#each subtitleVariants as track}
                                        <button
                                            class="flex items-center justify-between p-4 rounded-[20px] transition-all duration-200 cursor-pointer {track.selected
                                                ? 'bg-white text-black'
                                                : 'bg-white/8 text-white hover:bg-white/14'}"
                                            on:click={() => select(track)}
                                        >
                                            <span
                                                class="font-poppins font-medium truncate"
                                                title={track.label}
                                            >
                                                {track.label}
                                            </span>
                                            {#if track.selected}
                                                <svg
                                                    width="20"
                                                    height="20"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    stroke-width="3"
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                >
                                                    <polyline
                                                        points="20 6 9 17 4 12"
                                                    />
                                                </svg>
                                            {/if}
                                        </button>
                                    {/each}
                                {/if}
                            </div>
                        </div>
                </div>
            </div>
        {:else}
            <div class="flex flex-col gap-6">
                {#each Object.entries(groupedTracks) as [group, groupTracks]}
                    <div class="flex flex-col gap-3">
                        {#if Object.keys(groupedTracks).length > 1}
                            <h3 class="text-sm font-poppins font-medium text-white/45">
                                {group}
                            </h3>
                        {/if}
                        <div class="flex flex-col gap-2">
                            {#each groupTracks as track}
                                <button
                                    class="flex items-center justify-between p-4 rounded-[22px] transition-all duration-200 cursor-pointer {track.selected
                                        ? 'bg-white text-black'
                                        : 'bg-white/8 text-white hover:bg-white/14'}"
                                    on:click={() => select(track)}
                                >
                                    <span class="font-poppins font-medium"
                                        >{track.label}</span
                                    >
                                    {#if track.selected}
                                        <svg
                                            width="20"
                                            height="20"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="3"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            ><polyline
                                                points="20 6 9 17 4 12"
                                            /></svg
                                        >
                                    {/if}
                                </button>
                            {/each}
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </div>
</div>
