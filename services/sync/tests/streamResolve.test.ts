import { afterEach, describe, expect, mock, test } from "bun:test";
import { resolveStreamUrl } from "../src/streamResolve";

const TORRENTIO = "https://torrentio.strem.fun/resolve/torbox/key/hash/file/1/file.mkv";
const TORBOX = "https://api.torbox.app/v1/api/torrents/requestdl?token=secret";
const CDN = "https://nexus-1.weur.tb-cdn.st/file.mkv";

const realFetch = globalThis.fetch;
const redirects = (routes: Record<string, string>) => {
  const fetched: string[] = [];
  globalThis.fetch = mock(async (input: URL) => {
    fetched.push(input.href);
    const location = routes[input.href];
    return new Response(null, location ? { status: 307, headers: { location } } : { status: 200 });
  }) as unknown as typeof fetch;
  return fetched;
};

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("resolving a stream link", () => {
  test("follows the redirects to the file host without fetching the file", async () => {
    const fetched = redirects({ [TORRENTIO]: TORBOX, [TORBOX]: CDN });
    expect(await resolveStreamUrl(TORRENTIO)).toEqual({ url: CDN });
    expect(fetched).toEqual([TORRENTIO, TORBOX]);
  });

  test("hands back a host's own page when there's no redirect", async () => {
    redirects({});
    expect(await resolveStreamUrl(TORRENTIO)).toEqual({ url: TORRENTIO });
  });

  test("refuses to fetch any other host", async () => {
    const fetched = redirects({});
    await expect(resolveStreamUrl("https://169.254.169.254/latest")).rejects.toThrow("can't be resolved");
    await expect(resolveStreamUrl("http://torrentio.strem.fun/resolve")).rejects.toThrow("can't be resolved");
    expect(fetched).toEqual([]);
  });

  test("gives up on a redirect loop", async () => {
    redirects({ [TORRENTIO]: TORBOX, [TORBOX]: TORRENTIO });
    await expect(resolveStreamUrl(TORRENTIO)).rejects.toThrow("too many times");
  });
});
