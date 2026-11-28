<script lang="ts">
    let { video, offset }: { video: HTMLVideoElement | undefined; offset: number } = $props();

    let text = $state("");

    function activeText(tracks: TextTrackList) {
        const lines: string[] = [];
        for (const track of tracks) {
            if (track.mode !== "hidden" || !track.activeCues) continue;
            for (const cue of track.activeCues) lines.push((cue as VTTCue).text);
        }
        return lines.join("\n");
    }

    $effect(() => {
        if (!video) return;
        const tracks = video.textTracks;
        const render = () => (text = activeText(tracks));
        const follow = (event: TrackEvent) => {
            event.track?.addEventListener("cuechange", render);
            render();
        };

        for (const track of tracks) track.addEventListener("cuechange", render);
        tracks.addEventListener("addtrack", follow);
        tracks.addEventListener("change", render);
        render();

        return () => {
            for (const track of tracks) track.removeEventListener("cuechange", render);
            tracks.removeEventListener("addtrack", follow);
            tracks.removeEventListener("change", render);
            text = "";
        };
    });
</script>

<div class="cue-layer pointer-events-none absolute inset-0 z-30">
    {#if text}
        <p
            class="cue absolute inset-x-0 bottom-0 mx-auto text-center text-white transition-[translate] duration-300 ease-out"
            style:translate="0 {-offset}px"
        >{text}</p>
    {/if}
</div>

<style>
    .cue-layer {
        container-type: size;
    }

    .cue {
        max-width: 88%;
        font-size: 5cqh;
        line-height: 1.25;
        white-space: pre-line;
        text-wrap: balance;
        text-shadow: 0 0 4px black;
    }
</style>
