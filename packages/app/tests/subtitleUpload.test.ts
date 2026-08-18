import { afterEach, describe, expect, test } from "bun:test";
import {
    createUploadedSubtitleTrack,
    releaseUploadedSubtitleUrls,
} from "../src/pages/player/subtitles";

describe("uploaded subtitles", () => {
    afterEach(releaseUploadedSubtitleUrls);

    test("accepts SRT and VTT files with cues", async () => {
        const srt = new File(
            ["1\n00:00:01,000 --> 00:00:02,000\nHello"],
            "English.SRT",
        );
        const vtt = new File(
            ["WEBVTT\n\n00:01.000 --> 00:02.000\nHello"],
            "English.vtt",
        );

        expect((await createUploadedSubtitleTrack(srt)).format).toBe("srt");
        expect((await createUploadedSubtitleTrack(vtt)).format).toBe("vtt");
    });

    test("rejects unsupported or cue-less files", async () => {
        await expect(
            createUploadedSubtitleTrack(new File(["subtitle"], "English.ass")),
        ).rejects.toThrow("SRT or VTT");
        await expect(
            createUploadedSubtitleTrack(new File(["subtitle"], "English.srt")),
        ).rejects.toThrow("valid subtitle cues");
    });
});
