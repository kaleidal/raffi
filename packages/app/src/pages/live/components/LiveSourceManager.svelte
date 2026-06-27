<script lang="ts">
    import { tick } from "svelte";
    import { Pencil, Trash2, X } from "@lucide/svelte";
    import { trackEvent } from "../../../lib/analytics";
    import {
        addIptvSource,
        iptvSources,
        removeIptvSource,
        updateIptvSource,
    } from "../../../lib/iptv/store";
    import type { IptvSource, IptvSourceKind } from "../../../lib/iptv/types";

    interface IptvExample {
        name: string;
        m3uUrl: string;
        epgUrl: string;
    }

    export let show = false;
    export let selectedSourceId = "";
    export let resetRequest = 0;
    export let isDev = false;
    export let iptvExample: IptvExample | null = null;
    export let onSourceRemoved: (source: IptvSource) => void = () => {};

    let editingSourceId: string | null = null;
    let formKind: IptvSourceKind = "m3u";
    let formName = "";
    let formM3uUrl = "";
    let formEpgUrl = "";
    let formXtreamServerUrl = "";
    let formXtreamUsername = "";
    let formXtreamCredential = "";
    let formError = "";
    let lastResetRequest = resetRequest;

    $: if (resetRequest !== lastResetRequest) {
        lastResetRequest = resetRequest;
        resetForm();
    }

    function focusOnMount(node: HTMLElement) {
        void tick().then(() => node.focus());
    }

    function resetForm() {
        editingSourceId = null;
        formKind = "m3u";
        formName = "";
        formM3uUrl = "";
        formEpgUrl = "";
        formXtreamServerUrl = "";
        formXtreamUsername = "";
        formXtreamCredential = "";
        formError = "";
    }

    function editSource(source: IptvSource) {
        editingSourceId = source.id;
        formKind = source.kind;
        formName = source.name;
        if (source.kind === "xtream") {
            formM3uUrl = "";
            formEpgUrl = "";
            formXtreamServerUrl = source.serverUrl;
            formXtreamUsername = source.username;
            formXtreamCredential = source.credential;
        } else {
            formM3uUrl = source.m3uUrl;
            formEpgUrl = source.epgUrl ?? "";
            formXtreamServerUrl = "";
            formXtreamUsername = "";
            formXtreamCredential = "";
        }
        formError = "";
    }

    function setFormKind(kind: IptvSourceKind) {
        formKind = kind;
        formError = "";
    }

    function fillIptvExample() {
        if (!iptvExample) return;
        formKind = "m3u";
        formName = iptvExample.name;
        formM3uUrl = iptvExample.m3uUrl;
        formEpgUrl = iptvExample.epgUrl;
        formError = "";
    }

    function saveSource() {
        try {
            if (editingSourceId) {
                const updated =
                    formKind === "xtream"
                        ? updateIptvSource(editingSourceId, {
                              kind: "xtream",
                              name: formName,
                              serverUrl: formXtreamServerUrl,
                              username: formXtreamUsername,
                              credential: formXtreamCredential,
                          })
                        : updateIptvSource(editingSourceId, {
                              kind: "m3u",
                              name: formName,
                              m3uUrl: formM3uUrl,
                              epgUrl: formEpgUrl,
                          });
                if (!updated) {
                    throw new Error("The selected IPTV source no longer exists");
                }
                selectedSourceId = updated.id;
                trackEvent("iptv_source_updated");
            } else {
                const source =
                    formKind === "xtream"
                        ? addIptvSource({
                              kind: "xtream",
                              name: formName,
                              serverUrl: formXtreamServerUrl,
                              username: formXtreamUsername,
                              credential: formXtreamCredential,
                          })
                        : addIptvSource({
                              kind: "m3u",
                              name: formName,
                              m3uUrl: formM3uUrl,
                              epgUrl: formEpgUrl,
                          });
                selectedSourceId = source.id;
                trackEvent("iptv_source_added");
            }
            resetForm();
        } catch (error) {
            formError = error instanceof Error ? error.message : String(error);
        }
    }

    function deleteSource(source: IptvSource) {
        const confirmed =
            typeof window === "undefined" ||
            window.confirm(`Remove IPTV source "${source.name}"?`);
        if (!confirmed) return;

        removeIptvSource(source.id);
        if (editingSourceId === source.id) {
            resetForm();
        }
        onSourceRemoved(source);
        trackEvent("iptv_source_removed");
    }
</script>

{#if show}
    <div
        class="fixed inset-0 z-[220] flex items-center justify-center bg-[#101010]/56 p-5 backdrop-blur-xl md:p-8"
        onclick={(event) => {
            if (event.currentTarget === event.target) show = false;
        }}
        onkeydown={(event) => {
            if (event.key === "Escape") show = false;
        }}
        role="button"
        tabindex="0"
    >
        <section
            class="max-h-[92vh] w-full max-w-[1040px] overflow-y-auto rounded-4xl bg-[#2b2b2b]/56 p-6 shadow-[0_40px_160px_rgba(0,0,0,0.45)] backdrop-blur-[40px] md:p-8"
            role="dialog"
            aria-modal="true"
            tabindex="-1"
            use:focusOnMount
        >
            <div class="mb-5 flex items-start justify-between gap-4">
                <div>
                    <h2 class="font-poppins text-2xl font-semibold">
                        Live TV Sources
                    </h2>
                    <p class="mt-1 text-sm text-white/60">
                        Add M3U playlists, Xtream accounts, and guide data.
                    </p>
                </div>
                <button
                    class="shrink-0 cursor-pointer text-white/50 transition-colors hover:text-white"
                    aria-label="Close source manager"
                    onclick={() => (show = false)}
                >
                    <X size={24} strokeWidth={2} />
                </button>
            </div>

            <div class="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)]">
                <section class="rounded-[24px] bg-white/4 p-4">
                    <div class="mb-4 flex items-center justify-between gap-3">
                        <h3 class="font-poppins text-lg font-semibold">
                            Sources
                        </h3>
                    </div>

                    {#if $iptvSources.length > 0}
                        <div class="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
                            {#each $iptvSources as source}
                                <div
                                    class={`flex flex-col gap-3 rounded-2xl border p-3 transition-colors sm:flex-row sm:items-center sm:justify-between ${
                                        selectedSourceId === source.id
                                            ? "border-white/18 bg-white/[0.10]"
                                            : "border-white/8 bg-white/[0.04]"
                                    }`}
                                >
                                    <button
                                        class="min-w-0 flex-1 text-left"
                                        onclick={() => (selectedSourceId = source.id)}
                                    >
                                        <p class="truncate font-medium text-white">
                                            {source.name}
                                        </p>
                                        <p class="mt-1 text-xs uppercase tracking-[0.12em] text-white/42">
                                            {source.kind === "xtream" ? "Xtream" : "M3U"}
                                        </p>
                                    </button>
                                    <div class="flex shrink-0 gap-2">
                                        <button
                                            class="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-white/70 transition-colors hover:bg-white/14 hover:text-white"
                                            aria-label={`Edit ${source.name}`}
                                            onclick={() => editSource(source)}
                                        >
                                            <Pencil size={16} strokeWidth={2.2} />
                                        </button>
                                        <button
                                            class="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-white/70 transition-colors hover:bg-red-500/20 hover:text-red-100"
                                            aria-label={`Remove ${source.name}`}
                                            onclick={() => deleteSource(source)}
                                        >
                                            <Trash2 size={16} strokeWidth={2.2} />
                                        </button>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <div class="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-5 text-sm text-white/56">
                            No source configured yet.
                        </div>
                    {/if}
                </section>

                <section class="rounded-[24px] bg-white/4 p-4">
                    <h3 class="font-poppins text-lg font-semibold">
                        {editingSourceId ? "Edit Source" : "Add Source"}
                    </h3>
                    <div class="mt-4 flex flex-col gap-4">
                        <label class="flex flex-col gap-2 text-sm text-white/62">
                            Name
                            <input
                                class="h-11 rounded-2xl border border-white/10 bg-black/24 px-4 text-white outline-none focus:border-white/35"
                                bind:value={formName}
                            />
                        </label>

                        <div class="grid grid-cols-2 gap-1 rounded-full border border-white/10 bg-black/24 p-1">
                            <button
                                class={`h-9 rounded-full text-sm font-semibold transition-colors ${formKind === "m3u" ? "bg-white text-black" : "text-white/62 hover:bg-white/8 hover:text-white"}`}
                                aria-pressed={formKind === "m3u"}
                                onclick={() => setFormKind("m3u")}
                            >
                                M3U URL
                            </button>
                            <button
                                class={`h-9 rounded-full text-sm font-semibold transition-colors ${formKind === "xtream" ? "bg-white text-black" : "text-white/62 hover:bg-white/8 hover:text-white"}`}
                                aria-pressed={formKind === "xtream"}
                                onclick={() => setFormKind("xtream")}
                            >
                                Xtream
                            </button>
                        </div>

                        {#if formKind === "m3u"}
                            <label class="flex flex-col gap-2 text-sm text-white/62">
                                M3U URL
                                <input
                                    class="h-11 rounded-2xl border border-white/10 bg-black/24 px-4 text-white outline-none focus:border-white/35"
                                    bind:value={formM3uUrl}
                                    inputmode="url"
                                />
                            </label>
                            <label class="flex flex-col gap-2 text-sm text-white/62">
                                XMLTV URL
                                <input
                                    class="h-11 rounded-2xl border border-white/10 bg-black/24 px-4 text-white outline-none focus:border-white/35"
                                    bind:value={formEpgUrl}
                                    inputmode="url"
                                />
                            </label>
                        {:else}
                            <label class="flex flex-col gap-2 text-sm text-white/62">
                                Server URL
                                <input
                                    class="h-11 rounded-2xl border border-white/10 bg-black/24 px-4 text-white outline-none focus:border-white/35"
                                    bind:value={formXtreamServerUrl}
                                    inputmode="url"
                                />
                            </label>
                            <label class="flex flex-col gap-2 text-sm text-white/62">
                                Username
                                <input
                                    class="h-11 rounded-2xl border border-white/10 bg-black/24 px-4 text-white outline-none focus:border-white/35"
                                    bind:value={formXtreamUsername}
                                    autocomplete="off"
                                />
                            </label>
                            <label class="flex flex-col gap-2 text-sm text-white/62">
                                Password
                                <input
                                    class="h-11 rounded-2xl border border-white/10 bg-black/24 px-4 text-white outline-none focus:border-white/35"
                                    bind:value={formXtreamCredential}
                                    type="password"
                                    autocomplete="off"
                                />
                            </label>
                        {/if}

                        {#if formError}
                            <div class="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                                {formError}
                            </div>
                        {/if}

                        <div class="flex flex-wrap gap-2">
                            <button
                                class="h-11 flex-1 rounded-full bg-white px-5 text-sm font-semibold text-black transition-opacity hover:opacity-88"
                                onclick={saveSource}
                            >
                                {editingSourceId ? "Save Source" : "Add Source"}
                            </button>
                            {#if editingSourceId}
                                <button
                                    class="h-11 flex-1 rounded-full bg-white/8 px-5 text-sm font-semibold text-white/78 transition-colors hover:bg-white/14"
                                    onclick={resetForm}
                                >
                                    Cancel
                                </button>
                            {/if}
                        </div>

                        {#if isDev && iptvExample}
                            <button
                                class="h-10 rounded-full border border-white/10 text-sm text-white/60 transition-colors hover:bg-white/8 hover:text-white/82"
                                onclick={fillIptvExample}
                            >
                                Use IPTV example
                            </button>
                        {/if}
                    </div>
                </section>
            </div>
        </section>
    </div>
{/if}
