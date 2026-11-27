import { isAndroidPlatform } from "../../shell/platform";
import { preferredLanguage } from "../../utils/languages";
import type { EnrichedStream, ParsedStreamMetadata } from "./types";

export const RESOLUTION_RANKS: Record<string, number> = {
    "2160p": 5,
    "1440p": 4,
    "1080p": 3,
    "720p": 2,
    "480p": 1,
};

const COMFORTABLE_SIZE_GB_BY_RANK = [10, 2, 4, 10, 14, 25];

const Tier = {
    Good: 0,
    PoorMatch: 1,
    NotReady: 2,
    Broken: 3,
} as const;

export interface RankingContext {
    screenRank: number;
    language: string;
    hdrDisplay: boolean;
}

function screenResolutionRank() {
    const longestEdge = Math.max(window.screen.width, window.screen.height) * window.devicePixelRatio;
    if (longestEdge >= 3200) return RESOLUTION_RANKS["2160p"];
    if (longestEdge >= 2300) return RESOLUTION_RANKS["1440p"];
    if (longestEdge >= 1700) return RESOLUTION_RANKS["1080p"];
    return RESOLUTION_RANKS["720p"];
}

export function rankingContext(): RankingContext {
    return {
        screenRank: screenResolutionRank(),
        language: preferredLanguage(),
        hdrDisplay: window.matchMedia("(dynamic-range: high)").matches,
    };
}

const VIDEO_CODEC_PROBES: Partial<Record<string, string>> = {
    hevc: 'video/mp4; codecs="hvc1.1.6.L150.90"',
    av1: 'video/mp4; codecs="av01.0.12M.10"',
};
const videoCodecSupport = new Map<string, boolean>();

function canPlayVideoCodec(codec: ParsedStreamMetadata["videoCodec"]) {
    const probe = codec ? VIDEO_CODEC_PROBES[codec] : undefined;
    if (!probe || isAndroidPlatform || typeof MediaSource === "undefined") return true;
    let supported = videoCodecSupport.get(probe);
    if (supported === undefined) {
        supported = MediaSource.isTypeSupported(probe);
        videoCodecSupport.set(probe, supported);
    }
    return supported;
}

const lacksLanguage = (meta: ParsedStreamMetadata, language: string) =>
    meta.audioLanguageCodes.length > 0 && !meta.audioLanguageCodes.includes(language);

function streamTier({ meta, isFailed }: EnrichedStream, context: RankingContext) {
    if (isFailed || meta.statusBadges.some((badge) => badge.variant === "danger") || !canPlayVideoCodec(meta.videoCodec)) {
        return Tier.Broken;
    }
    if (meta.isCached === false) return Tier.NotReady;
    if (lacksLanguage(meta, context.language) || meta.releaseTypeLabel === "CAM") return Tier.PoorMatch;
    return Tier.Good;
}

function resolutionScore(rank: number, screenRank: number) {
    if (!rank) return 0;
    return rank <= screenRank ? rank * 200 : screenRank * 200 - (rank - screenRank) * 80;
}

function sizePenalty(meta: ParsedStreamMetadata) {
    const comfortableMb = COMFORTABLE_SIZE_GB_BY_RANK[meta.resolutionRank] * 1024;
    const oversizedGb = meta.sizeInMb ? Math.max(0, meta.sizeInMb - comfortableMb) / 1024 : 0;
    return Math.min(oversizedGb * 40, 800) + (meta.releaseTypeLabel === "Remux" ? 300 : 0);
}

function languageScore(meta: ParsedStreamMetadata, language: string) {
    const [primary] = meta.audioLanguageCodes;
    if (!primary) return meta.isDubbed ? -150 : 0;
    return primary === language ? 80 : -120;
}

function sourceScore(meta: ParsedStreamMetadata) {
    if (meta.sourceType === "local") return 5000;
    if (meta.availabilityLabel) return 3400;
    return meta.sourceType === "direct" ? 2600 : 1800;
}

function streamScore(meta: ParsedStreamMetadata, context: RankingContext) {
    const cached = meta.isCached === true ? 1200 : 0;
    const peers = Math.log2((meta.peerCount ?? 0) + 1) * 40;
    const hdr = meta.isHDR ? (context.hdrDisplay ? 60 : -60) : 0;
    const dolbyVisionOnly = meta.isDolbyVisionOnly ? 400 : 0;
    return (
        sourceScore(meta) +
        cached +
        resolutionScore(meta.resolutionRank, context.screenRank) +
        peers +
        hdr +
        languageScore(meta, context.language) -
        sizePenalty(meta) -
        dolbyVisionOnly
    );
}

export function compareRecommended(left: EnrichedStream, right: EnrichedStream, context: RankingContext) {
    return (
        streamTier(left, context) - streamTier(right, context) ||
        streamScore(right.meta, context) - streamScore(left.meta, context)
    );
}

function bestOf(streams: EnrichedStream[], context: RankingContext) {
    return streams.reduce<EnrichedStream | null>(
        (current, item) => (!current || compareRecommended(item, current, context) < 0 ? item : current),
        null,
    );
}

/** The stream one-click play starts: a good match that fits the screen, else a sharper good match, else none. */
export function pickBestStream(streams: EnrichedStream[], context: RankingContext): EnrichedStream | null {
    const good = streams.filter((item) => streamTier(item, context) === Tier.Good);
    const fitting = good.filter(({ meta }) => meta.resolutionRank <= context.screenRank);
    return bestOf(fitting, context) ?? bestOf(good, context);
}
