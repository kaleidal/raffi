import { describe, expect, test } from 'bun:test';
import { mergeProgress, normalizeAddonUrl, progressPercent, rankStreams } from './domain';

describe('shared domain', () => {
  test('normalizes addon URLs', () => expect(normalizeAddonUrl('example.com/manifest.json')).toBe('https://example.com'));
  test('ranks direct streams ahead of torrents', () => {
    const ranked = rankStreams([{ infoHash: 'abc', title: '2160p 40 peers' }, { url: 'https://video.test/movie.mp4', title: '1080p' }]);
    expect(ranked[0].sourceType).toBe('direct');
  });
  test('clamps progress', () => expect(progressPercent({ positionSeconds: 120, durationSeconds: 100 })).toBe(100));
  test('keeps newest progress', () => {
    const result = mergeProgress([
      { imdbId: 'tt1', type: 'movie', positionSeconds: 20, durationSeconds: 100, updatedAt: '2026-01-02T00:00:00Z' },
    ], [
      { imdbId: 'tt1', type: 'movie', positionSeconds: 10, durationSeconds: 100, updatedAt: '2026-01-01T00:00:00Z' },
    ]);
    expect(result[0].positionSeconds).toBe(20);
  });
});
