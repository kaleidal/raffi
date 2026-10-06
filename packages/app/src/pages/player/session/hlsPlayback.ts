import type Hls from "hls.js";

type HlsPlaybackOptions = {
    video: HTMLVideoElement;
    source: string;
    startTime: number;
    autoPlay: boolean;
    onReady: () => void;
    onFatalError: (error: Error, instance: Hls | null) => void;
};

function startAt(video: HTMLVideoElement, startTime: number) {
    if (startTime <= 0) return;
    try {
        video.currentTime = startTime;
    } catch {
    }
}

function finishLoading(options: HlsPlaybackOptions) {
    startAt(options.video, options.startTime);
    options.onReady();
    if (options.autoPlay) {
        options.video.play().catch(() => {});
    }
}

export async function attachHlsPlayback(options: HlsPlaybackOptions): Promise<Hls | null> {
    const Hls = (await import("hls.js")).default;
    if (Hls.isSupported()) {
        const instance = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            maxBufferLength: 50,
            maxMaxBufferLength: 80,
            backBufferLength: 30,
        });
        instance.attachMedia(options.video);
        instance.on(Hls.Events.MANIFEST_PARSED, () => finishLoading(options));
        instance.on(Hls.Events.ERROR, (_event, data) => {
            if (!data.fatal) return;
            instance.destroy();
            options.onFatalError(
                new Error(data.details || data.reason || "HLS playback failed"),
                instance,
            );
        });
        instance.loadSource(options.source);
        return instance;
    }

    if (!options.video.canPlayType("application/vnd.apple.mpegurl")) {
        throw new Error("HLS playback is not supported on this device");
    }

    options.video.src = options.source;
    options.video.addEventListener(
        "loadedmetadata",
        () => finishLoading(options),
        { once: true },
    );
    options.video.addEventListener(
        "error",
        () => options.onFatalError(
            new Error(options.video.error?.message || "Native HLS playback failed"),
            null,
        ),
        { once: true },
    );
    options.video.load();
    return null;
}
