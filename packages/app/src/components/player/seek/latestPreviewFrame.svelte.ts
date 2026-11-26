import type { SeekPreview } from "../../../lib/media/preview/seekPreview";

/** The newest thumbnail decoded while pointing along a timeline; the last one stays up until a newer one is ready. */
class LatestPreviewFrame {
    frame = $state.raw<ImageBitmap | null>(null);
    private requested = 0;
    private shown = 0;

    constructor(private readonly preview: SeekPreview) {}

    show(time: number) {
        const request = ++this.requested;
        const cached = this.preview.peek(time);
        if (cached) return this.present(cached, request);
        void this.preview.frameAt(time).then((frame) => {
            if (frame && request > this.shown) this.present(frame, request);
        });
    }

    private present(frame: ImageBitmap, request: number) {
        this.frame = frame;
        this.shown = request;
    }
}

const followers = new WeakMap<SeekPreview, LatestPreviewFrame>();

/** One follower per preview, so re-rendered timelines keep showing the frame they already have. */
export function latestPreviewFrame(preview: SeekPreview) {
    let follower = followers.get(preview);
    if (!follower) {
        follower = new LatestPreviewFrame(preview);
        followers.set(preview, follower);
    }
    return follower;
}
