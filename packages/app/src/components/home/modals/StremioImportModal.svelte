<script lang="ts">
    import { createEventDispatcher, onDestroy, tick } from "svelte";
    import { fade, scale } from "svelte/transition";
    import { Check, FileJson, X } from "@lucide/svelte";
    import {
        importStremioLibrary,
        type StremioImportProgressEvent,
    } from "../../../lib/db/db";
    import { trackEvent } from "../../../lib/analytics";
    import { withOverlayZoomStyle } from "../../../lib/overlayZoom";
    import LoadingSpinner from "../../common/LoadingSpinner.svelte";

    const portal = (node: HTMLElement) => {
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

    const dispatch = createEventDispatcher<{
        close: void;
        imported: { total: number; added: number; merged: number; skipped: number };
    }>();

    export let open = false;

    type Phase = "idle" | "parsing" | "applying" | "reconciling" | "uploading" | "done" | "error";

    let phase: Phase = "idle";
    let errorMessage = "";
    let progress: { processed: number; total: number; current?: string } = { processed: 0, total: 0 };
    let rawEntryCount: number | null = null;
    let resultSummary: null | {
        total: number;
        rawCount: number;
        added: number;
        merged: number;
        skipped: number;
        movies: number;
        series: number;
        watched: number;
    } = null;
    let bodyLocked = false;
    let dragActive = false;
    let fileInput: HTMLInputElement;
    let abortController: AbortController | null = null;
    let warnings: string[] = [];

    $: applyPercent = progress.total > 0
        ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
        : 0;

    $: dropzoneLabel = (() => {
        if (phase === "parsing") {
            if (rawEntryCount && rawEntryCount > 0) {
                return `Reading ${rawEntryCount} ${rawEntryCount === 1 ? "entry" : "entries"}…`;
            }
            return "Reading your export…";
        }
        if (phase === "applying") return `Importing… ${progress.processed}/${progress.total}`;
        if (phase === "reconciling" || phase === "uploading") return "Almost done…";
        if (phase === "done") return "Import complete";
        if (phase === "error") return "Try again with a different file";
        return "Drop your Stremio export here";
    })();

    $: phaseHint = (() => {
        if (phase === "parsing") return "Reading the JSON and converting each entry.";
        if (phase === "applying") return progress.current ? `Adding ${progress.current}` : "Adding entries to your library.";
        if (phase === "reconciling") return "Checking your other devices.";
        if (phase === "uploading") return "Backing up the merged library.";
        if (phase === "done") return "Your library is up to date.";
        return "…or click to pick a .json file";
    })();

    const toggleBodyScroll = (active: boolean) => {
        if (typeof document === "undefined") return;
        const body = document.body;
        const html = document.documentElement;
        const container = document.querySelector("[data-scroll-container]") as HTMLElement | null;
        const count = Number(body.dataset.modalCount || "0");
        if (active) {
            if (count === 0) {
                const scrollY = window.scrollY;
                body.dataset.scrollY = String(scrollY);
                body.dataset.prevOverflow = body.style.overflow || "";
                body.dataset.prevPosition = body.style.position || "";
                body.dataset.prevTop = body.style.top || "";
                body.dataset.prevWidth = body.style.width || "";
                body.style.overflow = "hidden";
                body.style.position = "fixed";
                body.style.top = `-${scrollY}px`;
                body.style.width = "100%";
                html.style.overflow = "hidden";
                if (container) {
                    container.dataset.prevOverflowY = container.style.overflowY || "";
                    container.dataset.prevOverflowX = container.style.overflowX || "";
                    container.style.overflowY = "hidden";
                    container.style.overflowX = "hidden";
                }
            }
            body.dataset.modalCount = String(count + 1);
            return;
        }
        const next = Math.max(0, count - 1);
        body.dataset.modalCount = String(next);
        if (next === 0) {
            const scrollY = Number(body.dataset.scrollY || "0");
            body.style.overflow = body.dataset.prevOverflow || "";
            body.style.position = body.dataset.prevPosition || "";
            body.style.top = body.dataset.prevTop || "";
            body.style.width = body.dataset.prevWidth || "";
            html.style.overflow = "";
            delete body.dataset.prevOverflow;
            delete body.dataset.prevPosition;
            delete body.dataset.prevTop;
            delete body.dataset.prevWidth;
            delete body.dataset.scrollY;
            if (container) {
                container.style.overflowY = container.dataset.prevOverflowY || "";
                container.style.overflowX = container.dataset.prevOverflowX || "";
                delete container.dataset.prevOverflowY;
                delete container.dataset.prevOverflowX;
            }
            window.scrollTo(0, scrollY);
        }
    };

    const updateBodyLock = (active: boolean) => {
        if (active && !bodyLocked) {
            toggleBodyScroll(true);
            bodyLocked = true;
        } else if (!active && bodyLocked) {
            toggleBodyScroll(false);
            bodyLocked = false;
        }
    };

    const isBusy = () =>
        phase === "parsing" || phase === "applying" || phase === "reconciling" || phase === "uploading";

    function close() {
        if (isBusy()) return;
        dispatch("close");
    }

    function reset() {
        phase = "idle";
        errorMessage = "";
        progress = { processed: 0, total: 0 };
        rawEntryCount = null;
        resultSummary = null;
        warnings = [];
        if (fileInput) fileInput.value = "";
    }

    function handleFile(file: File | null | undefined) {
        if (!file) return;
        if (isBusy()) return;
        void importFromFile(file);
    }

    function onFileChange(event: Event) {
        const target = event.currentTarget as HTMLInputElement;
        const file = target.files?.[0];
        handleFile(file);
    }

    function onDrop(event: DragEvent) {
        event.preventDefault();
        dragActive = false;
        if (isBusy()) return;
        const file = event.dataTransfer?.files?.[0];
        if (file) handleFile(file);
    }

    function onDragOver(event: DragEvent) {
        event.preventDefault();
        if (!isBusy()) dragActive = true;
    }

    function onDragLeave() {
        dragActive = false;
    }

    async function importFromFile(file: File) {
        reset();
        abortController = new AbortController();
        trackEvent("stremio_import_started", {
            file_name: file.name,
            file_size: file.size,
        });
        let text = "";
        try {
            text = await file.text();
        } catch (error: any) {
            errorMessage = "Could not read the file. Make sure it is the JSON export from Stremio.";
            phase = "error";
            trackEvent("stremio_import_failed", {
                stage: "read",
                error_name: error?.name || "unknown",
            });
            return;
        }
        await runImport(text);
    }

    async function runImport(text: string) {
        const onProgress = (event: StremioImportProgressEvent) => {
            if (event.phase === "parsing") {
                phase = "parsing";
                if (typeof event.rawCount === "number") rawEntryCount = event.rawCount;
            } else if (event.phase === "applying") {
                phase = "applying";
                progress = { processed: event.processed, total: event.total, current: event.current };
            } else if (event.phase === "reconciling") {
                phase = "reconciling";
            } else if (event.phase === "uploading") {
                phase = "uploading";
            } else if (event.phase === "done") {
                phase = "done";
            } else if (event.phase === "error") {
                phase = "error";
                errorMessage = event.message;
            }
        };
        try {
            const summary = await importStremioLibrary(text, {
                onProgress,
                signal: abortController?.signal,
            });
            warnings = summary.warnings;
            resultSummary = {
                total: summary.total,
                rawCount: summary.rawCount,
                added: summary.added,
                merged: summary.merged,
                skipped: summary.skipped,
                movies: summary.movies,
                series: summary.series,
                watched: summary.watched,
            };
            phase = "done";
            trackEvent("stremio_import_completed", {
                total: summary.total,
                added: summary.added,
                merged: summary.merged,
                skipped: summary.skipped,
            });
            dispatch("imported", {
                total: summary.total,
                added: summary.added,
                merged: summary.merged,
                skipped: summary.skipped,
            });
            await tick();
        } catch (error: any) {
            errorMessage = error?.message || "Something went wrong while importing.";
            phase = "error";
            trackEvent("stremio_import_failed", {
                stage: "process",
                error_name: error?.name || "unknown",
            });
        } finally {
            abortController = null;
        }
    }

    $: updateBodyLock(open);

    $: if (open) {
        reset();
    }

    onDestroy(() => {
        updateBodyLock(false);
    });
</script>

{#if open}
    <div
        use:portal
        class="fixed inset-0 z-200 bg-[#101010]/56 backdrop-blur-xl flex items-center justify-center"
        transition:fade={{ duration: 200 }}
        on:click|self={close}
        on:keydown={(e) => e.key === "Escape" && close()}
        on:wheel|preventDefault|stopPropagation
        role="button"
        tabindex="0"
        style={withOverlayZoomStyle("padding: clamp(20px, 4vw, 80px);")}
    >
        <div
            class="w-full max-w-xl max-h-full rounded-[32px] bg-[#2b2b2b]/62 backdrop-blur-[40px] p-6 md:p-8 flex flex-col gap-6 relative overflow-hidden shadow-[0_40px_160px_rgba(0,0,0,0.45)]"
            transition:scale={{ start: 0.95, duration: 200 }}
            on:click|stopPropagation
            on:keydown|stopPropagation
            on:wheel|stopPropagation
            role="dialog"
            tabindex="-1"
        >
            <div class="flex items-start justify-between gap-3">
                <h2 class="text-white text-2xl md:text-3xl font-semibold">Bring your watch history</h2>
                <button
                    on:click={close}
                    class="text-white/50 hover:text-white cursor-pointer transition-colors"
                    aria-label="Close import"
                    disabled={isBusy()}
                >
                    <X size={24} strokeWidth={2} />
                </button>
            </div>

            <ol class="flex flex-col gap-2 text-sm text-white/65 list-decimal pl-5">
                <li>Open the Stremio app and go to <span class="text-white">Settings</span>.</li>
                <li>Open the <span class="text-white">General</span> tab.</li>
                <li>Click <span class="text-white">Export user data</span> and save the JSON file.</li>
                <li>Drop or pick the file below.</li>
            </ol>

            <div class="flex flex-col gap-2">
                <label
                    class={`relative rounded-2xl border-2 border-dashed transition-colors p-6 flex flex-col items-center justify-center gap-2 text-center cursor-pointer ${dragActive ? "border-white/70 bg-white/10" : "border-white/15 hover:border-white/35 bg-black/20"}`}
                    on:dragover={onDragOver}
                    on:dragleave={onDragLeave}
                    on:drop={onDrop}
                >
                    <input
                        bind:this={fileInput}
                        type="file"
                        accept="application/json,.json"
                        class="sr-only"
                        on:change={onFileChange}
                        disabled={isBusy()}
                    />
                    <div class="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center">
                        {#if phase === "done"}
                            <Check size={20} strokeWidth={2.2} class="text-emerald-300" />
                        {:else if isBusy()}
                            <LoadingSpinner size="22px" />
                        {:else}
                            <FileJson size={20} strokeWidth={1.6} class="text-white/80" />
                        {/if}
                    </div>
                    <p class="text-white text-sm font-medium">{dropzoneLabel}</p>
                    <p class={`text-xs ${phase === "error" ? "text-red-200" : "text-white/55"}`}>{phaseHint}</p>
                    {#if isBusy() && progress.total > 0}
                        <div class="w-full mt-2">
                            <div class="h-1.5 rounded-full bg-white/10 overflow-hidden">
                                <div
                                    class="h-full bg-white/80 transition-[width] duration-150"
                                    style="width: {applyPercent}%;"
                                ></div>
                            </div>
                        </div>
                    {/if}
                </label>

                {#if phase === "error" && errorMessage}
                    <p class="text-red-200 text-sm">{errorMessage}</p>
                {/if}

                {#if phase === "done" && resultSummary}
                    <div class="rounded-2xl bg-emerald-500/12 text-emerald-100 px-4 py-3 text-sm flex flex-col gap-1">
                        <p>
                            {resultSummary.total}
                            {resultSummary.movies && !resultSummary.series
                                ? (resultSummary.movies === 1 ? "movie" : "movies")
                                : resultSummary.series && !resultSummary.movies
                                    ? (resultSummary.series === 1 ? "show" : "shows")
                                    : `item${resultSummary.total === 1 ? "" : "s"}`}
                            imported
                        </p>
                        <p class="text-emerald-50/80 text-xs">
                            {resultSummary.added} new · {resultSummary.merged} updated · {resultSummary.skipped} unchanged
                            {#if resultSummary.rawCount > resultSummary.total}
                                · {resultSummary.rawCount} entries in file
                            {/if}
                        </p>
                    </div>
                {/if}

                {#if phase === "done" && warnings.length}
                    <ul class="text-amber-200/90 text-xs list-disc pl-4">
                        {#each warnings as warning}
                            <li>{warning}</li>
                        {/each}
                    </ul>
                {/if}
            </div>

            <div class="flex flex-wrap items-center justify-end gap-3">
                <button
                    class="px-4 py-2 rounded-2xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors cursor-pointer"
                    on:click={close}
                    disabled={isBusy()}
                >
                    {phase === "done" ? "Close" : "Cancel"}
                </button>
                {#if phase === "done"}
                    <button
                        class="px-5 py-2 rounded-2xl bg-white text-black font-semibold hover:bg-white/90 transition-colors cursor-pointer"
                        on:click={reset}
                    >
                        Import another
                    </button>
                {/if}
            </div>
        </div>
    </div>
{/if}
