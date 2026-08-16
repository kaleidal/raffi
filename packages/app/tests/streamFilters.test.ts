import { describe, expect, test } from "bun:test";
import {
    applyStreamFilters,
    buildEnrichedStreams,
    getAvailableStreamFilterOptions,
    parseStreamMetadata,
} from "../src/components/meta/modals/streams/streamFilters";
import type { StreamFilterState } from "../src/components/meta/modals/streams/types";

const cachedCometStream = {
    name: "[TB⚡] Comet 1080p",
    description: [
        "📄 Teen.Wolf.S04E09.Perishable.1080p.BluRay.x264-ROVERS.rus.eng.Sony.Sci-Fi.mkv",
        "📹 avc",
        "⭐ BluRay | 🏷️ Fi",
        "💾 3.3 GB 🔎 StremThru",
        "🌎/🇬🇧/🇷🇺",
    ].join("\n"),
    url: "https://example.invalid/video",
    behaviorHints: {
        filename: "Teen.Wolf.S04E09.Perishable.1080p.BluRay.x264-ROVERS.rus.eng.Sony.Sci-Fi.mkv",
        videoSize: 3.3 * 1024 * 1024 * 1024,
    },
};

const uncachedCometStream = {
    name: "[TB⬇️] Comet 720p",
    description: [
        "📄 Teen.Wolf.4x09.La.Lista.ITA-ENG.720p.DLMux.DD5.1.h264-NovaRip.mkv",
        "📹 avc | 🔊 Dolby Digital • 5.1",
        "⭐ WEBMux | 🏷️ NovaRip",
        "💾 1.4 GB 🔎 DMM",
        "🌎/🇬🇧/🇮🇹",
    ].join("\n"),
    url: "https://example.invalid/video-2",
    behaviorHints: {
        filename: "Teen.Wolf.4x09.La.Lista.ITA-ENG.720p.DLMux.DD5.1.h264-NovaRip.mkv",
        videoSize: 1.4 * 1024 * 1024 * 1024,
    },
};

const torrentioStream = {
    name: "Torrentio\n4k HDR",
    title: [
        "Dune.2021.2160p.HMAX.WEB-DL.DDP5.1.Atmos.HDR.HEVC-EVO[TGx]",
        "👤 231 💾 20.32 GB ⚙️ ThePirateBay",
    ].join("\n"),
    infoHash: "torrentio-fixture",
    fileIdx: 0,
    behaviorHints: {
        filename: "Dune.2021.2160p.HMAX.WEB-DL.DDP5.1.Atmos.HDR.HEVC-EVO[TGx]",
        bingeGroup: "torrentio|fixture",
    },
};

const pirateBayStream = {
    name: "TPB+",
    title: [
        "Dune Part One 2021 Bluray 2160p AV1 HDR10 EN/ITA/FR/ES/HINDI TrueHD 7.1-UH",
        "📺 4k BluRay",
        "👤 68 💾 17.32 GB",
    ].join("\n"),
    infoHash: "tpb-fixture",
    tag: "4k",
};

const defaultFilters: StreamFilterState = {
    resolutionFilter: "all",
    audioLanguageFilter: "all",
    sortOption: "recommended",
    videoCodecFilter: "all",
    dynamicRangeFilter: "all",
    availabilityFilter: "all",
    sizeFilter: "all",
};

describe("Comet stream metadata", () => {
    test("uses structured hints and does not mistake a release tag for an audio language", () => {
        const meta = parseStreamMetadata(cachedCometStream);

        expect(meta.providerLabel).toBe("StremThru");
        expect(meta.audioLanguageCodes).toEqual(["EN", "RU"]);
        expect(meta.isDubbed).toBe(false);
        expect(meta.videoCodec).toBe("h264");
        expect(meta.releaseTypeLabel).toBe("BluRay");
        expect(meta.debridServiceLabel).toBe("TorBox");
        expect(meta.debridDashboardUrl).toBe("https://www.torbox.app/dashboard");
        expect(meta.isCached).toBe(true);
        expect(meta.statusBadges.map((badge) => badge.label)).not.toContain("TorBox");
        expect(meta.statusBadges.map((badge) => badge.label)).toContain("Cached");
        expect(meta.sizeInMb).toBeCloseTo(3.3 * 1024, 3);
    });

    test("recognizes uncached availability and exposes only useful filter choices", () => {
        const streams = buildEnrichedStreams([cachedCometStream, uncachedCometStream]);
        const options = getAvailableStreamFilterOptions(streams);

        expect(streams[1].meta.isCached).toBe(false);
        expect(options.resolutions.map((option) => option.value)).toEqual(["all", "1080p", "720p"]);
        expect(options.codecs.map((option) => option.value)).toEqual(["all", "h264"]);
        expect(options.dynamicRanges.map((option) => option.value)).toEqual(["all", "sdr"]);
        expect(options.availability.map((option) => option.value)).toEqual(["all", "cached"]);
        expect(options.sizes.map((option) => option.value)).toEqual(["all", "2gb"]);
    });

    test("filters by cache state and maximum file size", () => {
        const streams = buildEnrichedStreams([cachedCometStream, uncachedCometStream]);

        expect(applyStreamFilters(streams, { ...defaultFilters, availabilityFilter: "cached" })).toHaveLength(1);
        expect(applyStreamFilters(streams, { ...defaultFilters, sizeFilter: "2gb" })[0].meta.providerLabel).toBe("DMM");
    });
});

describe("public torrent addon metadata", () => {
    test("parses Torrentio title metadata and keeps the addon identity concise", () => {
        const meta = parseStreamMetadata(torrentioStream);

        expect(meta.providerLabel).toBe("ThePirateBay");
        expect(meta.hostLabel).toBe("Torrentio");
        expect(meta.sourceType).toBe("torrent");
        expect(meta.peerCount).toBe(231);
        expect(meta.sizeInMb).toBeCloseTo(20.32 * 1024, 2);
        expect(meta.videoCodec).toBe("hevc");
        expect(meta.releaseTypeLabel).toBe("WEB-DL");
        expect(meta.isHDR).toBe(true);
    });

    test("parses ThePirateBay+ filename-style language runs without behavior hints", () => {
        const meta = parseStreamMetadata(pirateBayStream);

        expect(meta.providerLabel).toBe("TPB+");
        expect(meta.audioLanguageCodes).toEqual(["EN", "IT", "FR", "ES", "HI"]);
        expect(meta.videoCodec).toBe("av1");
        expect(meta.releaseTypeLabel).toBe("BluRay");
        expect(meta.peerCount).toBe(68);
        expect(meta.sizeInMb).toBeCloseTo(17.32 * 1024, 2);
    });
});
