<script lang="ts">
    import LoadingSpinner from "../../../components/common/LoadingSpinner.svelte";
    import { refreshLineup } from "../../../lib/live/refresh/refresh";
    import { newSourceId, saveSource } from "../../../lib/live/sources";
    import { normalizeServerUrl } from "../../../lib/live/xtream";
    import { splitGuideUrls } from "../../../lib/live/parse/m3u";
    import type { LiveSource, LiveSourceKind } from "../../../lib/live/types";

    export let source: LiveSource | null = null;
    export let onDone: (source: LiveSource) => void;
    export let onCancel: () => void;

    let kind: LiveSourceKind = source?.kind ?? "m3u";
    let name = source?.name ?? "";
    let playlistUrl = source?.kind === "m3u" ? source.playlistUrl : "";
    let guideUrl = source?.kind === "m3u" ? (source.guideUrl ?? "") : "";
    let serverUrl = source?.kind === "xtream" ? source.serverUrl : "";
    let username = source?.kind === "xtream" ? source.username : "";
    let password = source?.kind === "xtream" ? source.password : "";
    let saving = false;
    let error = "";

    const input =
        "min-h-11 rounded-2xl bg-white/8 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:bg-white/12";

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
    <div class="relative grid h-11 w-full grid-cols-2 rounded-full bg-white/8 p-1">
        <span
            class="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-white transition-transform duration-200 {kind === 'xtream' ? 'translate-x-full' : ''}"
        ></span>
        {#each [["m3u", "Playlist"], ["xtream", "Xtream Codes"]] as [value, label] (value)}
            <button
                type="button"
                class="relative z-10 rounded-full text-sm font-semibold cursor-pointer transition-colors duration-200 {kind === value ? 'text-black' : 'text-white/60 hover:text-white'}"
                onclick={() => (kind = value as LiveSourceKind)}
            >
                {label}
            </button>
        {/each}
    </div>

    <label class="flex flex-col gap-2">
        <span class="text-xs text-white/45">Name</span>
        <input class={input} bind:value={name} placeholder="Optional" autocomplete="off" />
    </label>

    {#if kind === "m3u"}
        <label class="flex flex-col gap-2">
            <span class="text-xs text-white/45">Playlist</span>
            <input class={input} bind:value={playlistUrl} placeholder="https://example.com/playlist.m3u" autocomplete="off" />
        </label>
        <label class="flex flex-col gap-2">
            <span class="text-xs text-white/45">Guide</span>
            <input class={input} bind:value={guideUrl} placeholder="Optional XMLTV address" autocomplete="off" />
        </label>
    {:else}
        <label class="flex flex-col gap-2">
            <span class="text-xs text-white/45">Server</span>
            <input class={input} bind:value={serverUrl} placeholder="http://example.com:8080" autocomplete="off" />
        </label>
        <div class="grid gap-4 sm:grid-cols-2">
            <label class="flex flex-col gap-2">
                <span class="text-xs text-white/45">Username</span>
                <input class={input} bind:value={username} autocomplete="off" />
            </label>
            <label class="flex flex-col gap-2">
                <span class="text-xs text-white/45">Password</span>
                <input class={input} bind:value={password} type="password" autocomplete="off" />
            </label>
        </div>
    {/if}

    {#if error}
        <p class="text-sm text-red-300">{error}</p>
    {/if}

    <div class="flex justify-end gap-3 pt-2">
        <button
            type="button"
            class="rounded-2xl bg-white/10 px-4 py-2 font-semibold text-white hover:bg-white/20 cursor-pointer"
            onclick={onCancel}
        >
            Cancel
        </button>
        <button
            type="submit"
            class="flex min-w-24 items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2 font-semibold text-black hover:bg-white/90 cursor-pointer disabled:cursor-wait disabled:opacity-70"
            disabled={saving}
        >
            {#if saving}
                <LoadingSpinner size="16px" color="#000000" />
                Loading channels
            {:else}
                Save
            {/if}
        </button>
    </div>
</form>
