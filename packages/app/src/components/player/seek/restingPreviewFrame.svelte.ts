import type { SeekPreview } from "../../../lib/media/preview/seekPreview";

const SETTLE_MS = 120;

/** The thumbnail where the pointer rests on a timeline: blank while it decodes, and only decoded once the pointer settles. */
class RestingPreviewFrame {
    frame = $state.raw<ImageBitmap | null>(null);
    private requested = 0;
    private settle: ReturnType<typeof setTimeout> | undefined;

    constructor(private readonly preview: SeekPreview) {}

    show(time: number) {
        clearTimeout(this.settle);
        const request = ++this.requested;
        this.frame = this.preview.peek(time);
        if (this.frame) return;
        this.settle = setTimeout(() => {
            void this.preview.frameAt(time).then((frame) => {
                if (request === this.requested) this.frame = frame;
            });
        }, SETTLE_MS);
    }
}

const followers = new WeakMap<SeekPreview, RestingPreviewFrame>();

/** One follower per preview, so re-rendered timelines keep the frame they already show. */
export function restingPreviewFrame(preview: SeekPreview) {
    let follower = followers.get(preview);
    if (!follower) {
        follower = new RestingPreviewFrame(preview);
        followers.set(preview, follower);
    }
    return follower;
}
