<script lang="ts">
    import { untrack } from "svelte";
    import { fade, scale } from "svelte/transition";
    import { ArrowLeft, Pencil, Plus, Trash2, X } from "@lucide/svelte";
    import { portal } from "../../../components/common/portal";
    import SourceForm from "./SourceForm.svelte";
    import { confirmDialog } from "../../../lib/shell/systemDialogs";
    import { liveSettings, removeSource } from "../../../lib/live/sources";
    import type { LiveSource } from "../../../lib/live/types";

    let {
        open = $bindable(false),
        onSaved,
        onRemoved,
    }: {
        open?: boolean;
        onSaved: (source: LiveSource) => void;
        onRemoved: (sourceId: string) => void;
    } = $props();

    let editing = $state.raw<LiveSource | null | undefined>();

    $effect.pre(() => {
        if (open) editing = untrack(() => $liveSettings.sources.length) ? undefined : null;
    });

    const title = $derived(editing === undefined ? "Live TV sources" : editing ? "Edit source" : "Add a source");

    const describe = (source: LiveSource) =>
        source.kind === "xtream" ? `Xtream · ${new URL(source.serverUrl).host}` : new URL(source.playlistUrl).host;

    function close() {
        open = false;
    }

    async function remove(source: LiveSource) {
        if (!(await confirmDialog(`Remove ${source.name} from Live TV?`, "Remove source"))) return;
        await removeSource(source.id);
        onRemoved(source.id);
    }
</script>

{#if open}
    <div
        use:portal
        class="raffi-modal-backdrop fixed inset-0 z-200 flex items-center justify-center bg-canvas/56 backdrop-blur-xl"
        transition:fade={{ duration: 200 }}
        onclick={(event) => event.target === event.currentTarget && close()}
        onkeydown={(event) => event.key === "Escape" && close()}
        role="button"
        tabindex="0"
    >
        <div
            class="raffi-modal-surface relative flex w-full max-w-xl flex-col gap-6 overflow-y-auto rounded-[32px] bg-raised/62 p-6 shadow-[0_40px_160px_rgba(0,0,0,0.45)] backdrop-blur-[40px] md:p-8"
            transition:scale={{ start: 0.95, duration: 200 }}
            role="dialog"
            tabindex="-1"
        >
            <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                    {#if editing !== undefined && $liveSettings.sources.length}
                        <button class="text-ink/50 hover:text-ink cursor-pointer" aria-label="Back" onclick={() => (editing = undefined)}>
                            <ArrowLeft size={22} strokeWidth={2} />
                        </button>
                    {/if}
                    <h2 class="text-2xl font-semibold text-ink md:text-3xl">{title}</h2>
                </div>
                <button class="text-ink/50 hover:text-ink cursor-pointer" aria-label="Close" onclick={close}>
                    <X size={24} strokeWidth={2} />
                </button>
            </div>

            {#if editing === undefined}
                <ul class="flex flex-col gap-1">
                    {#each $liveSettings.sources as source, index (source.id)}
                        <li class="group flex items-center gap-4 rounded-2xl px-3 py-2.5 hover:bg-ink/6">
                            <span class="w-5 shrink-0 text-center font-semibold tabular-nums text-ink/35">{index + 1}</span>
                            <span class="flex min-w-0 flex-1 flex-col">
                                <span class="truncate text-ink">{source.name}</span>
                                <span class="truncate text-xs text-ink/45">{describe(source)}</span>
                            </span>
                            <button class="rounded-full p-2 text-ink/50 hover:bg-ink/10 hover:text-ink cursor-pointer" aria-label="Edit {source.name}" onclick={() => (editing = source)}>
                                <Pencil size={16} strokeWidth={2} />
                            </button>
                            <button class="rounded-full p-2 text-ink/50 hover:bg-ink/10 hover:text-danger cursor-pointer" aria-label="Remove {source.name}" onclick={() => remove(source)}>
                                <Trash2 size={16} strokeWidth={2} />
                            </button>
                        </li>
                    {/each}
                </ul>
                <button
                    class="flex items-center justify-center gap-2 self-start rounded-2xl bg-ink/10 px-4 py-2 font-semibold text-ink hover:bg-ink/20 cursor-pointer"
                    onclick={() => (editing = null)}
                >
                    <Plus size={18} strokeWidth={2} />
                    Add a source
                </button>
            {:else}
                {#key editing}
                    <SourceForm
                        source={editing}
                        onDone={(source) => {
                            const added = editing === null;
                            onSaved(source);
                            editing = undefined;
                            if (added) close();
                        }}
                        onCancel={() => ($liveSettings.sources.length ? (editing = undefined) : close())}
                    />
                {/key}
            {/if}
        </div>
    </div>
{/if}
