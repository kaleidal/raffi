<script lang="ts">
    import { createEventDispatcher, onDestroy, tick } from "svelte";
    import { fade, scale } from "svelte/transition";
    import { Check, X } from "@lucide/svelte";
    import {
        importStremioFromAccount,
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

    type Phase = "idle" | "fetching" | "parsing" | "applying" | "reconciling" | "uploading" | "done" | "error";

    let phase: Phase = "idle";
    let email = "";
    let password = "";
    let keepConnected = true;
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
    let abortController: AbortController | null = null;
    let warnings: string[] = [];

    $: applyPercent = progress.total > 0
        ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
        : 0;

    $: statusLabel = (() => {
        if (phase === "fetching") return "Signing in to Stremio…";
        if (phase === "parsing") {
            if (rawEntryCount && rawEntryCount > 0) {
                return `Reading ${rawEntryCount} ${rawEntryCount === 1 ? "entry" : "entries"}…`;
            }
            return "Reading your library…";
        }
        if (phase === "applying") return `Importing… ${progress.processed}/${progress.total}`;
        if (phase === "reconciling" || phase === "uploading") return "Almost done…";
        if (phase === "done") return "Import complete";
        if (phase === "error") return "Could not import";
        return "Sign in with your Stremio account";
    })();

    $: statusHint = (() => {
        if (phase === "fetching") return "Connecting to Stremio and loading your library.";
        if (phase === "parsing") return "Converting each title and its watch progress.";
        if (phase === "applying") return progress.current ? `Adding ${progress.current}` : "Adding entries to your library.";
        if (phase === "reconciling") return "Checking your other devices.";
        if (phase === "uploading") return "Backing up the merged library.";
        if (phase === "done") return "Your library is up to date.";
        return "We only use your credentials to read your library. Your password is never stored.";
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
        phase === "fetching" || phase === "parsing" || phase === "applying" || phase === "reconciling" || phase === "uploading";

    const canSubmit = () =>
        !isBusy() && email.trim().length > 0 && password.length > 0;

    function close() {
        if (isBusy()) return;
        dispatch("close");
    }

    function reset() {
        phase = "idle";
        errorMessage = "";
        password = "";
        progress = { processed: 0, total: 0 };
        rawEntryCount = null;
        resultSummary = null;
        warnings = [];
    }

    async function runImport() {
        if (!canSubmit()) return;
        reset();
        abortController = new AbortController();
        trackEvent("stremio_import_started", { source: "account_login" });

        const onProgress = (event: StremioImportProgressEvent) => {
            if (event.phase === "fetching") {
                phase = "fetching";
            } else if (event.phase === "parsing") {
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
            const summary = await importStremioFromAccount(email, password, {
                onProgress,
                signal: abortController?.signal,
                keepConnected,
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
            password = "";
            trackEvent("stremio_import_completed", {
                total: summary.total,
                added: summary.added,
                merged: summary.merged,
                skipped: summary.skipped,
                keep_connected: keepConnected,
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
                stage: "login",
                error_name: error?.name || "unknown",
            });
        } finally {
            abortController = null;
        }
    }

    function handleSubmit(event: Event) {
        event.preventDefault();
        void runImport();
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

            <form class="flex flex-col gap-4" on:submit={handleSubmit}>
                <p class="text-sm text-white/65">{statusHint}</p>

                {#if phase === "idle" || phase === "error"}
                    <label class="flex flex-col gap-2">
                        <span class="text-xs text-white/45">Email</span>
                        <input
                            type="email"
                            autocomplete="username"
                            bind:value={email}
                            placeholder="you@example.com"
                            class="min-h-11 rounded-2xl bg-white/8 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:bg-white/12"
                            disabled={isBusy()}
                        />
                    </label>

                    <label class="flex flex-col gap-2">
                        <span class="text-xs text-white/45">Password</span>
                        <input
                            type="password"
                            autocomplete="current-password"
                            bind:value={password}
                            placeholder="Stremio password"
                            class="min-h-11 rounded-2xl bg-white/8 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:bg-white/12"
                            disabled={isBusy()}
                        />
                    </label>

                    <label class="flex items-start gap-3 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            bind:checked={keepConnected}
                            class="sr-only"
                            disabled={isBusy()}
                        />
                        <span
                            class="mt-0.5 h-5 w-5 shrink-0 rounded-md border transition-colors flex items-center justify-center {keepConnected ? 'bg-white border-white' : 'border-white/25 bg-white/5'}"
                            aria-hidden="true"
                        >
                            {#if keepConnected}
                                <Check size={14} strokeWidth={2.5} class="text-black" />
                            {/if}
                        </span>
                        <span class="text-sm text-white/70 leading-snug">
                            Keep connected so you can sync again from settings without signing in each time.
                        </span>
                    </label>
                {:else}
                    <div class="rounded-2xl bg-black/20 px-4 py-5 flex flex-col items-center gap-3 text-center">
                        {#if phase === "done"}
                            <Check size={22} strokeWidth={2.2} class="text-emerald-300" />
                        {:else}
                            <LoadingSpinner size="22px" />
                        {/if}
                        <p class="text-white text-sm font-medium">{statusLabel}</p>
                        {#if isBusy() && progress.total > 0}
                            <div class="w-full mt-1">
                                <div class="h-1.5 rounded-full bg-white/10 overflow-hidden">
                                    <div
                                        class="h-full bg-white/80 transition-[width] duration-150"
                                        style="width: {applyPercent}%;"
                                    ></div>
                                </div>
                            </div>
                        {/if}
                    </div>
                {/if}

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
                                · {resultSummary.rawCount} entries in Stremio
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

                <div class="flex flex-wrap items-center justify-end gap-3 pt-1">
                    <button
                        type="button"
                        class="px-4 py-2 rounded-2xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors cursor-pointer"
                        on:click={close}
                        disabled={isBusy()}
                    >
                        {phase === "done" ? "Close" : "Cancel"}
                    </button>
                    {#if phase === "idle" || phase === "error"}
                        <button
                            type="submit"
                            class="px-5 py-2 rounded-2xl bg-white text-black font-semibold hover:bg-white/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={!canSubmit()}
                        >
                            Import library
                        </button>
                    {:else if phase === "done"}
                        <button
                            type="button"
                            class="px-5 py-2 rounded-2xl bg-white text-black font-semibold hover:bg-white/90 transition-colors cursor-pointer"
                            on:click={reset}
                        >
                            Import again
                        </button>
                    {/if}
                </div>
            </form>
        </div>
    </div>
{/if}
