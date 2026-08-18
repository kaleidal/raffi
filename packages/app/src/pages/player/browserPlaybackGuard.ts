import * as Session from "./videoSession";

type BrowserPlaybackGuardOptions = {
    getVideo: () => HTMLVideoElement | undefined;
    getSource: () => string;
    hasEmbed: () => boolean;
    isDesktop: boolean;
    showError: (reason: string, details: string) => void;
};

export function createBrowserPlaybackGuard(options: BrowserPlaybackGuardOptions) {
    let audioCheckTimeout: ReturnType<typeof setTimeout> | null = null;

    const clearAudioCheck = () => {
        if (!audioCheckTimeout) return;
        clearTimeout(audioCheckTimeout);
        audioCheckTimeout = null;
    };

    const playbackDetails = () => {
        const source = options.getSource();
        const support = source
            ? Session.getDirectMediaSupport(source, options.getVideo())
            : null;
        const alternative = options.isDesktop
            ? "Try an MP4, WebM, or HLS stream. MKV and some audio codecs can be remuxed in-app with MediaBunny."
            : "Try an MP4, WebM, or HLS stream, or use the desktop app for formats this browser cannot decode.";
        return support && !support.supported
            ? `This browser does not report support for ${support.container}. ${alternative}`
            : `The browser rejected this stream. ${alternative}`;
    };

    const fail = (reason: string) => {
        clearAudioCheck();
        try {
            options.getVideo()?.pause();
        } catch {
        }
        options.showError(reason, playbackDetails());
    };

    const handleVideoError = () => {
        const error = options.getVideo()?.error;
        fail(error?.message || `Media error ${error?.code ?? "unknown"}.`);
    };

    const scheduleAudioCheck = () => {
        clearAudioCheck();
        const source = options.getSource();
        if (options.hasEmbed() || !/^https?:\/\//i.test(source)) return;
        audioCheckTimeout = setTimeout(() => {
            const video = options.getVideo();
            if (!video || video.paused || video.ended) return;
            if ((video as HTMLVideoElement & { mozHasAudio?: boolean }).mozHasAudio === false) {
                fail("The stream loaded without a playable audio track.");
            }
        }, 3500);
    };

    return {
        clearAudioCheck,
        handleVideoError,
        scheduleAudioCheck,
    };
}
