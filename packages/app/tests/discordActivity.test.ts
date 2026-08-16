import { describe, expect, test } from "bun:test";
import { buildDiscordActivity } from "../src/pages/player/discord";
import type { ShowResponse } from "../src/lib/library/types/meta_types";

const show = {
    meta: {
        type: "series",
        name: "The 100",
        year: "2014",
        imdb_id: "tt2661044",
        poster: "https://images.example/the-100.jpg",
        videos: [{
            season: 1,
            episode: 2,
            name: "Earth Skills",
            thumbnail: "https://images.example/episode.jpg",
        }],
    },
} as ShowResponse;

describe("Discord activity", () => {
    test("shows title art, progress, timestamps, and useful links", () => {
        expect(buildDiscordActivity(show, 1, 2, 2_000, 500, true, 10_000)).toEqual({
            type: 3,
            statusDisplayType: 2,
            details: "The 100",
            state: "S1 E2 · Earth Skills · 25%",
            startTimestamp: 9_500,
            endTimestamp: 11_500,
            largeImageKey: "https://images.example/the-100.jpg",
            largeImageText: "The 100",
            smallImageKey: "play",
            smallImageText: "Watching with Raffi",
            buttons: [
                { label: "Download Raffi", url: "https://raffi.al" },
                {
                    label: "View on IMDb",
                    url: "https://www.imdb.com/title/tt2661044/",
                },
            ],
            instance: false,
        });
    });

    test("freezes progress while paused", () => {
        const activity = buildDiscordActivity(show, 1, 2, 2_000, 500, false, 10_000);
        expect(activity?.state).toBe("Paused · S1 E2 · Earth Skills · 25%");
        expect(activity?.startTimestamp).toBeUndefined();
        expect(activity?.endTimestamp).toBeUndefined();
        expect(activity?.smallImageKey).toBe("pause");
    });
});
