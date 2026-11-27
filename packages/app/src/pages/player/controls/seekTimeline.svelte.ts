import { onDestroy, untrack } from "svelte";
import { readBufferedRanges, type TimeRange } from "../../../components/player/seek/seekTrack";
import { SeekPreview } from "../../../lib/media/preview/seekPreview";

const WARM_BUFFER_SECONDS = 20;

/** Seconds buffered past the playhead, or the rest of the video once it is buffered to the end. */
function bufferedAhead(video: HTMLVideoElement) {
    const time = video.currentTime;
    for (let index = 0; index < video.buffered.length; index++) {
        const end = video.buffered.end(index);
        if (video.buffered.start(index) <= time && time <= end) return end >= video.duration - 1 ? Infinity : end - time;
    }
    return 0;
}

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
        void preview?.warm({
            getDuration: () => getVideo()?.duration ?? 0,
            getPlayhead: () => getVideo()?.currentTime ?? 0,
            canFetch: () => {
                const video = getVideo();
                return Boolean(video && !video.seeking && bufferedAhead(video) >= WARM_BUFFER_SECONDS);
            },
        });
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
