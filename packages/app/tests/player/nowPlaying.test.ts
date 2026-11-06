import { describe, expect, test } from "bun:test";
import type { ShowResponse } from "../../src/lib/library/types/meta_types";
import { buildNowPlaying } from "../../src/pages/player/integrations/mediaSession";

const show = (meta: Record<string, unknown>) => ({ meta }) as unknown as ShowResponse;

describe("now playing details", () => {
  test("names the episode, with the show as the artist", () => {
    const series = show({
      type: "series",
      name: "Teen Wolf",
      poster: "https://images.example/poster.jpg",
      videos: [{ season: 5, episode: 4, name: "Condition Terminal", thumbnail: "https://images.example/ep.jpg" }],
    });
    expect(buildNowPlaying(series, 5, 4)).toEqual({
      title: "Condition Terminal",
      artist: "Teen Wolf",
      album: "Season 5, Episode 4",
      artwork: [{ src: "https://images.example/ep.jpg" }, { src: "https://images.example/poster.jpg" }],
    });
  });

  test("falls back to the episode number when it has no name", () => {
    const series = show({ type: "series", name: "Teen Wolf", poster: null, videos: [] });
    expect(buildNowPlaying(series, 1, 2)).toMatchObject({ title: "Episode 2", artwork: [] });
  });

  test("uses the film's name and year", () => {
    const movie = show({ type: "movie", name: "The Bride!", year: 2026, poster: "https://images.example/p.jpg" });
    expect(buildNowPlaying(movie, null, null)).toEqual({
      title: "The Bride!",
      artist: "2026",
      album: "",
      artwork: [{ src: "https://images.example/p.jpg" }],
    });
  });

  test("has nothing to show without metadata", () => {
    expect(buildNowPlaying(null, null, null)).toBeNull();
  });
});
