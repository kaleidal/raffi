<script lang="ts">
    import { untrack } from "svelte";
    import { ArrowLeft, Pencil, Plus, Trash2 } from "@lucide/svelte";
    import Button from "../../../components/common/controls/Button.svelte";
    import Dialog from "../../../components/common/dialog/Dialog.svelte";
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
    <Dialog {title} onClose={close} class="max-w-xl">
        {#snippet leading()}
            {#if editing !== undefined && $liveSettings.sources.length}
                <button
                    class="-ml-2 cursor-pointer rounded-full p-2 text-ink/50 transition-colors hover:bg-ink/8 hover:text-ink"
                    aria-label="Back"
                    onclick={() => (editing = undefined)}
                >
                    <ArrowLeft size={22} strokeWidth={2} />
                </button>
            {/if}
        {/snippet}

        {#if editing === undefined}
            <ul class="-mx-3 flex min-h-0 flex-col gap-0.5 overflow-y-auto">
                {#each $liveSettings.sources as source, index (source.id)}
                    <li class="flex items-center gap-4 rounded-[18px] px-3 py-2.5 hover:bg-ink/6">
                        <span class="w-5 shrink-0 text-center font-semibold tabular-nums text-ink/35">{index + 1}</span>
                        <span class="flex min-w-0 flex-1 flex-col">
                            <span class="truncate">{source.name}</span>
                            <span class="truncate text-xs text-ink/45">{describe(source)}</span>
                        </span>
                        <button class="cursor-pointer rounded-full p-2 text-ink/50 hover:bg-ink/10 hover:text-ink" aria-label="Edit {source.name}" onclick={() => (editing = source)}>
                            <Pencil size={16} strokeWidth={2} />
                        </button>
                        <button class="cursor-pointer rounded-full p-2 text-ink/50 hover:bg-ink/10 hover:text-danger" aria-label="Remove {source.name}" onclick={() => remove(source)}>
                            <Trash2 size={16} strokeWidth={2} />
                        </button>
                    </li>
                {/each}
            </ul>
            <Button class="self-start" onclick={() => (editing = null)}>
                <Plus size={18} strokeWidth={2} />
                Add a source
            </Button>
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
    </Dialog>
{/if}
