<script lang="ts">
    import { untrack } from "svelte";
    import LoadingSpinner from "../../../components/common/loading/LoadingSpinner.svelte";
    import { refreshLineup } from "../../../lib/live/refresh/refresh";
    import { newSourceId, saveSource } from "../../../lib/live/sources";
    import { normalizeServerUrl } from "../../../lib/live/xtream";
    import { splitGuideUrls } from "../../../lib/live/parse/m3u";
    import type { LiveSource, LiveSourceKind } from "../../../lib/live/types";

    let {
        source = null,
        onDone,
        onCancel,
    }: {
        source?: LiveSource | null;
        onDone: (source: LiveSource) => void;
        onCancel: () => void;
    } = $props();

    const initial = untrack(() => source);

    let kind = $state<LiveSourceKind>(initial?.kind ?? "m3u");
    let name = $state(initial?.name ?? "");
    let playlistUrl = $state(initial?.kind === "m3u" ? initial.playlistUrl : "");
    let guideUrl = $state(initial?.kind === "m3u" ? (initial.guideUrl ?? "") : "");
    let serverUrl = $state(initial?.kind === "xtream" ? initial.serverUrl : "");
    let username = $state(initial?.kind === "xtream" ? initial.username : "");
    let password = $state(initial?.kind === "xtream" ? initial.password : "");
    let saving = $state(false);
    let error = $state("");

    const input =
        "min-h-11 rounded-2xl bg-ink/8 px-4 text-sm text-ink outline-none placeholder:text-ink/30 focus:bg-ink/12";

    const isWebAddress = (value: string) => /^https?:\/\/\S+$/i.test(value.trim());

    function build(): LiveSource {
        const base = {
            id: source?.id ?? newSourceId(),
            createdAt: source?.createdAt ?? Date.now(),
        };
        if (kind === "m3u") {
            if (!isWebAddress(playlistUrl)) throw new Error("Enter the playlist's web address");
            if (guideUrl.trim() && !splitGuideUrls(guideUrl).length) throw new Error("Enter the guide's web address, or leave it empty");
            const url = new URL(playlistUrl.trim());
            return {
                ...base,
                kind,
                name: name.trim() || url.hostname,
                playlistUrl: playlistUrl.trim(),
                guideUrl: guideUrl.trim() || undefined,
            };
        }
        if (!username.trim() || !password) throw new Error("Enter your username and password");
        const server = normalizeServerUrl(serverUrl);
        return {
            ...base,
            kind,
            name: name.trim() || new URL(server).hostname,
            serverUrl: server,
            username: username.trim(),
            password,
        };
    }

    const sameAddress = (next: LiveSource) =>
        source !== null &&
        JSON.stringify({ ...source, name: "" }) === JSON.stringify({ ...next, name: "" });

    async function submit(event: SubmitEvent) {
        event.preventDefault();
        error = "";
        let next: LiveSource;
        try {
            next = build();
        } catch (problem) {
            error = problem instanceof Error ? problem.message : String(problem);
            return;
        }
        saving = true;
        try {
            if (!sameAddress(next)) await refreshLineup(next);
            await saveSource(next);
            onDone(next);
        } catch (problem) {
            error = problem instanceof Error ? problem.message : String(problem);
        } finally {
            saving = false;
        }
    }
</script>

<form class="flex min-h-0 flex-col gap-4" onsubmit={submit}>
    <div class="relative grid h-11 w-full grid-cols-2 rounded-full bg-ink/8 p-1">
        <span
            class="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-accent transition-transform duration-200 {kind === 'xtream' ? 'translate-x-full' : ''}"
        ></span>
        {#each [["m3u", "Playlist"], ["xtream", "Xtream Codes"]] as [value, label] (value)}
            <button
                type="button"
                class="relative z-10 rounded-full text-sm font-semibold cursor-pointer transition-colors duration-200 {kind === value ? 'text-on-accent' : 'text-ink/60 hover:text-ink'}"
                onclick={() => (kind = value as LiveSourceKind)}
            >
                {label}
            </button>
        {/each}
    </div>

    <label class="flex flex-col gap-2">
        <span class="text-xs text-ink/45">Name</span>
        <input class={input} bind:value={name} placeholder="Optional" autocomplete="off" />
    </label>

    {#if kind === "m3u"}
        <label class="flex flex-col gap-2">
            <span class="text-xs text-ink/45">Playlist</span>
            <input class={input} bind:value={playlistUrl} placeholder="https://example.com/playlist.m3u" autocomplete="off" />
        </label>
        <label class="flex flex-col gap-2">
            <span class="text-xs text-ink/45">Guide</span>
            <input class={input} bind:value={guideUrl} placeholder="Optional XMLTV address" autocomplete="off" />
        </label>
    {:else}
        <label class="flex flex-col gap-2">
            <span class="text-xs text-ink/45">Server</span>
            <input class={input} bind:value={serverUrl} placeholder="http://example.com:8080" autocomplete="off" />
        </label>
        <div class="grid gap-4 sm:grid-cols-2">
            <label class="flex flex-col gap-2">
                <span class="text-xs text-ink/45">Username</span>
                <input class={input} bind:value={username} autocomplete="off" />
            </label>
            <label class="flex flex-col gap-2">
                <span class="text-xs text-ink/45">Password</span>
                <input class={input} bind:value={password} type="password" autocomplete="off" />
            </label>
        </div>
    {/if}

    {#if error}
        <p class="text-sm text-danger">{error}</p>
    {/if}

    <div class="flex justify-end gap-3 pt-2">
        <button
            type="button"
            class="rounded-2xl bg-ink/10 px-4 py-2 font-semibold text-ink hover:bg-ink/20 cursor-pointer"
            onclick={onCancel}
        >
            Cancel
        </button>
        <button
            type="submit"
            class="flex min-w-24 items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-2 font-semibold text-on-accent hover:bg-accent/85 cursor-pointer disabled:cursor-wait disabled:opacity-70"
            disabled={saving}
        >
            {#if saving}
                <LoadingSpinner size="16px" />
                Loading channels
            {:else}
                Save
            {/if}
        </button>
    </div>
</form>
