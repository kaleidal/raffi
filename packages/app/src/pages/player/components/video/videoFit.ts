const SMART_COVER_MAX_CROP_RATIO = 0.02;
const MANUAL_ZOOM_SCALE = 1.035;

export type VideoFit = {
    objectFit: "contain" | "cover";
    objectPosition: string;
    transform: string;
};

const getSmartCoverCropRatio = (
    containerElem: HTMLElement | undefined,
    videoElem: HTMLVideoElement | undefined,
) => {
    if (!containerElem || !videoElem) return 1;

    const containerWidth = containerElem.clientWidth;
    const containerHeight = containerElem.clientHeight;
    const { videoWidth, videoHeight } = videoElem;

    if (!containerWidth || !containerHeight || !videoWidth || !videoHeight) {
        return 1;
    }

    const videoAspect = videoWidth / videoHeight;
    const containerAspect = containerWidth / containerHeight;

    if (!Number.isFinite(videoAspect) || !Number.isFinite(containerAspect)) {
        return 1;
    }

    if (videoAspect > containerAspect) {
        return 1 - containerAspect / videoAspect;
    }

    return 1 - videoAspect / containerAspect;
};

/** Zooms slightly in "cover" mode, and fills the frame in "contain" mode when that crops almost nothing. */
export const resolveVideoFit = (
    objectFit: "contain" | "cover",
    containerElem: HTMLElement | undefined,
    videoElem: HTMLVideoElement | undefined,
): VideoFit => {
    if (objectFit === "cover") {
        return {
            objectFit: "cover",
            objectPosition: "center center",
            transform: `scale(${MANUAL_ZOOM_SCALE})`,
        };
    }

    const cropRatio = getSmartCoverCropRatio(containerElem, videoElem);
    const useSmartCover = cropRatio > 0 && cropRatio <= SMART_COVER_MAX_CROP_RATIO;

    return {
        objectFit: useSmartCover ? "cover" : "contain",
        objectPosition: "center center",
        transform: "none",
    };
};
