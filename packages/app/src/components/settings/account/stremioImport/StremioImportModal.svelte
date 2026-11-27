<script lang="ts">
    import Button from "../../../common/controls/Button.svelte";
    import Dialog from "../../../common/dialog/Dialog.svelte";
    import { Check } from "@lucide/svelte";
    import {
        importStremioFromPreview,
        previewStremioImportFromAccount,
    } from "../../../../lib/import/stremioAccount";
    import type { StremioImportProgressEvent } from "../../../../lib/import/stremioImport";
    import {
        defaultSelectedAddonIds,
        defaultSelectedLibraryIds,
        type StremioImportPreview,
    } from "../../../../lib/import/stremioImportPreview";
    import LoadingSpinner from "../../../common/loading/LoadingSpinner.svelte";
    import AddonSelection from "./AddonSelection.svelte";
    import CheckMark from "./CheckMark.svelte";
    import ImportResult from "./ImportResult.svelte";
    import LibrarySelection from "./LibrarySelection.svelte";
    import SignInFields from "./SignInFields.svelte";
    import {
        importStatusHint,
        importStatusLabel,
        type ImportPhase,
        type ImportProgress,
        type ImportResultSummary,
    } from "./importStatus";

    let {
        open,
        onClose,
        onImported,
    }: {
        open: boolean;
        onClose: () => void;
        onImported: () => void;
    } = $props();

    let phase = $state<ImportPhase>("idle");
    let email = $state("");
    let password = $state("");
    let keepConnected = $state(true);
    let errorMessage = $state("");
    let progress = $state.raw<ImportProgress>({ processed: 0, total: 0 });
    let rawEntryCount = $state<number | null>(null);
    let previewData = $state.raw<StremioImportPreview | null>(null);
    let selectedLibraryIds = $state.raw<string[]>([]);
    let selectedAddonIds = $state.raw<string[]>([]);
    let resultSummary = $state.raw<ImportResultSummary | null>(null);
    let abortController: AbortController | null = null;
    let warnings = $state.raw<string[]>([]);

    const applyPercent = $derived(
        progress.total > 0
            ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
            : 0,
    );

    const statusLabel = $derived(importStatusLabel(phase, rawEntryCount, progress));
    const statusHint = $derived(importStatusHint(phase, progress));

    const busy = $derived(
        phase === "fetching"
        || phase === "parsing"
        || phase === "importing_addons"
        || phase === "applying"
        || phase === "reconciling"
        || phase === "uploading",
    );

    const canSignIn = $derived(
        !busy
        && phase !== "preview"
        && email.trim().length > 0
        && password.length > 0,
    );

    const canImportSelection = $derived(
        phase === "preview"
        && !busy
        && (selectedLibraryIds.length > 0 || selectedAddonIds.length > 0),
    );

    $effect.pre(() => {
        if (open) reset();
    });

    function close() {
        if (busy) return;
        onClose();
    }

    function reset() {
        phase = "idle";
        errorMessage = "";
        password = "";
        progress = { processed: 0, total: 0 };
        rawEntryCount = null;
        previewData = null;
        selectedLibraryIds = [];
        selectedAddonIds = [];
        resultSummary = null;
        warnings = [];
    }

    function backToSignIn() {
        if (busy) return;
        phase = "idle";
        errorMessage = "";
        previewData = null;
        selectedLibraryIds = [];
        selectedAddonIds = [];
        password = "";
    }

    const onProgress = (event: StremioImportProgressEvent) => {
        phase = event.phase;
        if (event.phase === "parsing" && typeof event.rawCount === "number") {
            rawEntryCount = event.rawCount;
        } else if (event.phase === "applying") {
            progress = { processed: event.processed, total: event.total, current: event.current };
        } else if (event.phase === "error") {
            errorMessage = event.message;
        }
    };

    async function loadPreview() {
        if (!canSignIn) return;
        errorMessage = "";
        phase = "fetching";
        abortController = new AbortController();

        try {
            const preview = await previewStremioImportFromAccount(email, password);
            if (abortController?.signal.aborted) return;

            previewData = preview;
            selectedLibraryIds = Array.from(defaultSelectedLibraryIds(preview.libraryItems));
            selectedAddonIds = Array.from(defaultSelectedAddonIds(preview.addons));
            warnings = preview.warnings;
            password = "";
            phase = "preview";
        } catch (error: any) {
            errorMessage = error?.message || "Something went wrong while signing in.";
            phase = "error";
        } finally {
            abortController = null;
        }
    }

    async function runImport() {
        if (!canImportSelection || !previewData) return;
        errorMessage = "";
        abortController = new AbortController();

        try {
            const summary = await importStremioFromPreview(
                previewData,
                {
                    libraryIds: selectedLibraryIds,
                    addonIds: selectedAddonIds,
                },
                {
                    onProgress,
                    signal: abortController?.signal,
                    keepConnected,
                },
            );
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
                addonsAdded: summary.addonsAdded,
                addonsSkipped: summary.addonsSkipped,
            };
            phase = "done";
            previewData = null;
            onImported();
        } catch (error: any) {
            errorMessage = error?.message || "Something went wrong while importing.";
            phase = "error";
        } finally {
            abortController = null;
        }
    }

    function handleSubmit(event: Event) {
        event.preventDefault();
        if (phase === "preview") {
            void runImport();
            return;
        }
        void loadPreview();
    }
</script>

{#if open}
    <Dialog title="Bring your watch history" onClose={busy ? undefined : close} class="max-w-xl">
        <form class="flex flex-col gap-4 min-h-0" onsubmit={handleSubmit}>
            <p class="text-sm text-ink/65 shrink-0">{statusHint}</p>

            {#if phase === "idle" || phase === "error"}
                <SignInFields bind:email bind:password bind:keepConnected disabled={busy} />
            {:else if phase === "preview" && previewData}
                <div class="flex flex-col gap-4 min-h-0 overflow-hidden">
                    {#if previewData.libraryItems.length > 0}
                        <LibrarySelection items={previewData.libraryItems} bind:selected={selectedLibraryIds} />
                    {/if}

                    {#if previewData.addons.length > 0}
                        <AddonSelection addons={previewData.addons} bind:selected={selectedAddonIds} />
                    {/if}

                    {#if previewData.libraryItems.length === 0 && previewData.addons.length === 0}
                        <p class="text-sm text-ink/60 text-center py-4">
                            Nothing found in this Stremio account.
                        </p>
                    {/if}

                    {#if warnings.length}
                        <ul class="text-warning/90 text-xs list-disc pl-4 shrink-0">
                            {#each warnings as warning}
                                <li>{warning}</li>
                            {/each}
                        </ul>
                    {/if}

                    <label class="flex items-start gap-3 cursor-pointer select-none shrink-0">
                        <input
                            type="checkbox"
                            bind:checked={keepConnected}
                            class="sr-only"
                        />
                        <CheckMark checked={keepConnected} />
                        <span class="text-sm text-ink/70 leading-snug">
                            Keep connected for future syncs from settings.
                        </span>
                    </label>
                </div>
            {:else}
                <div class="px-4 py-5 flex flex-col items-center gap-3 text-center">
                    {#if phase === "done"}
                        <Check size={22} strokeWidth={2.2} class="text-success" />
                    {:else}
                        <LoadingSpinner size="22px" />
                    {/if}
                    <p class="text-ink text-sm font-medium">{statusLabel}</p>
                    {#if busy && progress.total > 0}
                        <div class="w-full mt-1">
                            <div class="h-1.5 rounded-full bg-ink/10 overflow-hidden">
                                <div
                                    class="h-full bg-ink/80 transition-[width] duration-150"
                                    style="width: {applyPercent}%;"
                                ></div>
                            </div>
                        </div>
                    {/if}
                </div>
            {/if}

            {#if phase === "error" && errorMessage}
                <p class="text-danger text-sm">{errorMessage}</p>
            {/if}

            {#if phase === "done" && resultSummary}
                <ImportResult summary={resultSummary} />
            {/if}

            {#if phase === "done" && warnings.length}
                <ul class="text-warning/90 text-xs list-disc pl-4">
                    {#each warnings as warning}
                        <li>{warning}</li>
                    {/each}
                </ul>
            {/if}

            <div class="flex flex-wrap items-center justify-end gap-2 pt-1 shrink-0">
                {#if phase === "preview"}
                    <Button type="button" onclick={backToSignIn}>Back</Button>
                {:else}
                    <Button type="button" onclick={close} disabled={busy}>
                        {phase === "done" ? "Close" : "Cancel"}
                    </Button>
                {/if}

                {#if phase === "idle" || phase === "error"}
                    <Button type="submit" variant="primary" disabled={!canSignIn}>Continue</Button>
                {:else if phase === "preview"}
                    <Button type="submit" variant="primary" disabled={!canImportSelection}>Import selected</Button>
                {:else if phase === "done"}
                    <Button type="button" variant="primary" onclick={reset}>Import again</Button>
                {/if}
            </div>
        </form>
    </Dialog>
{/if}
