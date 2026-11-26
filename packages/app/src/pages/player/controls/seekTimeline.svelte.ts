import { onDestroy, untrack } from "svelte";
import { readBufferedRanges, type TimeRange } from "../../../components/player/seek/seekTrack";
import { SeekPreview } from "../../../lib/media/preview/seekPreview";

/** Feeds the seek bar: thumbnails for sources that can be read directly, and the ranges buffered so far. */
export function createSeekTimeline({
    getVideo,
    getPreviewSource,
}: {
    getVideo: () => HTMLVideoElement | undefined;
    getPreviewSource: () => string | null;
}) {
    let preview = $state.raw<SeekPreview | null>(null);
    let buffered = $state.raw<TimeRange[]>([]);

    const followPreviewSource = (src: string | null) => {
        if (preview?.src === src) return;
        preview?.dispose();
        preview = src ? new SeekPreview(src) : null;
    };

    $effect(() => {
        const src = getPreviewSource();
        untrack(() => followPreviewSource(src));
    });

    onDestroy(() => followPreviewSource(null));

    return {
        get preview() {
            return preview;
        },
        get buffered() {
            return buffered;
        },
        refreshBuffered() {
            const video = getVideo();
            if (!video) return;
            const next = readBufferedRanges(video.buffered, buffered);
            if (next !== buffered) buffered = next;
        },
    };
}
