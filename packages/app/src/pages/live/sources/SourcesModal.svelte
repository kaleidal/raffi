<script lang="ts">
    import { fade, scale } from "svelte/transition";
    import { ArrowLeft, Pencil, Plus, Trash2, X } from "@lucide/svelte";
    import { portal } from "../../../components/common/portal";
    import SourceForm from "./SourceForm.svelte";
    import { confirmDialog } from "../../../lib/shell/systemDialogs";
    import { liveSettings, removeSource } from "../../../lib/live/sources";
    import type { LiveSource } from "../../../lib/live/types";

    export let open = false;
    export let onSaved: (source: LiveSource) => void;
    export let onRemoved: (sourceId: string) => void;

    let editing: LiveSource | null | undefined;
    let wasOpen = false;

    $: if (open !== wasOpen) {
        wasOpen = open;
        if (open) editing = $liveSettings.sources.length ? undefined : null;
    }
    $: title = editing === undefined ? "Live TV sources" : editing ? "Edit source" : "Add a source";

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
        class="raffi-modal-backdrop fixed inset-0 z-200 flex items-center justify-center bg-[#101010]/56 backdrop-blur-xl"
        transition:fade={{ duration: 200 }}
        onclick={(event) => event.target === event.currentTarget && close()}
        onkeydown={(event) => event.key === "Escape" && close()}
        role="button"
        tabindex="0"
    >
        <div
            class="raffi-modal-surface relative flex w-full max-w-xl flex-col gap-6 overflow-y-auto font-poppins rounded-[32px] bg-[#2b2b2b]/62 p-6 shadow-[0_40px_160px_rgba(0,0,0,0.45)] backdrop-blur-[40px] md:p-8"
            transition:scale={{ start: 0.95, duration: 200 }}
            role="dialog"
            tabindex="-1"
        >
            <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                    {#if editing !== undefined && $liveSettings.sources.length}
                        <button class="text-white/50 hover:text-white cursor-pointer" aria-label="Back" onclick={() => (editing = undefined)}>
                            <ArrowLeft size={22} strokeWidth={2} />
                        </button>
                    {/if}
                    <h2 class="text-2xl font-semibold text-white md:text-3xl">{title}</h2>
                </div>
                <button class="text-white/50 hover:text-white cursor-pointer" aria-label="Close" onclick={close}>
                    <X size={24} strokeWidth={2} />
                </button>
            </div>

            {#if editing === undefined}
                <ul class="flex flex-col gap-1">
                    {#each $liveSettings.sources as source, index (source.id)}
                        <li class="group flex items-center gap-4 rounded-2xl px-3 py-2.5 hover:bg-white/6">
                            <span class="w-5 shrink-0 text-center font-semibold tabular-nums text-white/35">{index + 1}</span>
                            <span class="flex min-w-0 flex-1 flex-col">
                                <span class="truncate text-white">{source.name}</span>
                                <span class="truncate text-xs text-white/45">{describe(source)}</span>
                            </span>
                            <button class="rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white cursor-pointer" aria-label="Edit {source.name}" onclick={() => (editing = source)}>
                                <Pencil size={16} strokeWidth={2} />
                            </button>
                            <button class="rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-red-300 cursor-pointer" aria-label="Remove {source.name}" onclick={() => remove(source)}>
                                <Trash2 size={16} strokeWidth={2} />
                            </button>
                        </li>
                    {/each}
                </ul>
                <button
                    class="flex items-center justify-center gap-2 self-start rounded-2xl bg-white/10 px-4 py-2 font-semibold text-white hover:bg-white/20 cursor-pointer"
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
