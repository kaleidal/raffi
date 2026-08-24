import { afterEach, describe, expect, test } from "bun:test";
import { get } from "svelte/store";
import { mergeProgressEntry } from "../src/lib/db/state";
import {
    metaData,
    progressMap,
    selectedEpisode,
} from "../src/pages/meta/metaState";
import { handleProgress } from "../src/pages/meta/progressLogic";

describe("playback progress lifecycle", () => {
    afterEach(() => {
        selectedEpisode.set(null);
        metaData.set(null);
        progressMap.set({});
    });

    test("starting a watched episode clears its watched state", async () => {
        const episode = { season: 1, episode: 2, released: "2025-01-01" };
        selectedEpisode.set(episode);
        metaData.set({
            meta: {
                type: "series",
                videos: [episode],
            },
        } as any);
        progressMap.set({
            "1:2": {
                time: 1800,
                duration: 1800,
                watched: true,
                updatedAt: 100,
            },
        });

        await handleProgress(5, 1800, "tt-progress-test", true);

        expect((get(progressMap) as any)["1:2"]).toMatchObject({
            time: 5,
            duration: 1800,
            watched: false,
        });
    });

    test("newer unwatched progress wins over stale watched progress", () => {
        const merged = mergeProgressEntry(
            { time: 12, duration: 1800, watched: false, updatedAt: 200 },
            { time: 1800, duration: 1800, watched: true, updatedAt: 100 },
        );

        expect(merged).toEqual({
            time: 12,
            duration: 1800,
            watched: false,
            updatedAt: 200,
        });

        expect(mergeProgressEntry(
            { time: 12, duration: 1800, watched: false, updatedAt: 100 },
            { time: 1800, duration: 1800, watched: true, updatedAt: 200 },
        )).toMatchObject({ watched: true, updatedAt: 200 });
    });
});
