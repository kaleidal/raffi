import { afterEach, describe, expect, mock, test } from "bun:test";
import { verifyWithDebounce } from "../src/auth/debounce";
import { isDisposableDomain, screenEmail } from "../src/auth/emailPolicy";

describe("screenEmail", () => {
  test("accepts ordinary addresses and normalizes them", () => {
    expect(screenEmail("  Kristof@Gmail.com ")).toEqual({ ok: true, email: "kristof@gmail.com" });
    expect(screenEmail("me@lanth.me")).toEqual({ ok: true, email: "me@lanth.me" });
    expect(screenEmail("someone@company.co")).toEqual({ ok: true, email: "someone@company.co" });
    expect(screenEmail("someone@business.cm")).toEqual({ ok: true, email: "someone@business.cm" });
  });

  test("rejects malformed addresses", () => {
    for (const email of ["", "plain", "a@b", "a@@b.com", "a b@c.com", "a@-bad.com", "a@bad.c0m"]) {
      expect(screenEmail(email)).toEqual({ ok: false, reason: "invalid" });
    }
  });

  test("rejects disposable domains and their subdomains", () => {
    expect(screenEmail("x@mailinator.com")).toEqual({ ok: false, reason: "disposable" });
    expect(isDisposableDomain("inbox.mailinator.com")).toBe(true);
    expect(isDisposableDomain("gmail.com")).toBe(false);
  });

  test("suggests the intended provider for common typos", () => {
    const cases: Record<string, string> = {
      "a@gmial.com": "a@gmail.com",
      "a@gmai.com": "a@gmail.com",
      "a@gmail.co": "a@gmail.com",
      "a@gmail.con": "a@gmail.com",
      "a@gnail.cmo": "a@gmail.com",
      "a@hotmial.com": "a@hotmail.com",
      "a@outlok.com": "a@outlook.com",
      "a@iclod.com": "a@icloud.com",
      "a@yahooo.com": "a@yahoo.com",
      "a@protonmial.com": "a@protonmail.com",
      "a@hotmail.cmo": "a@hotmail.com",
      "a@lanth.con": "a@lanth.com",
    };
    for (const [email, suggestion] of Object.entries(cases)) {
      expect(screenEmail(email)).toEqual({ ok: false, reason: "typo", suggestion });
    }
  });

  test("leaves real domains that look like typos alone", () => {
    for (const email of [
      "a@mail.com", "a@email.com", "a@ymail.com", "a@hotmail.de", "a@hotmail.co.uk", "a@yahoo.fr",
      "a@outlook.es", "a@live.com", "a@gmx.at", "a@me.com",
    ]) {
      expect(screenEmail(email).ok).toBe(true);
    }
  });
});

describe("verifyWithDebounce", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const respond = (status: number, body: unknown) => {
    const fetchMock = mock(async (_input: string | URL | Request) => Response.json(body, { status }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  };

  const result = (code: string, didYouMean = "") => ({
    success: "1",
    debounce: { email: "a@example.com", code, result: "", reason: "", did_you_mean: didYouMean },
  });

  test("sends the key and address", async () => {
    const fetchMock = respond(200, result("5"));
    expect(await verifyWithDebounce("key", "a@example.com")).toEqual({ ok: true });
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.origin + url.pathname).toBe("https://api.debounce.io/v1/");
    expect(url.searchParams.get("api")).toBe("key");
    expect(url.searchParams.get("email")).toBe("a@example.com");
  });

  test("rejects invalid, spam trap and disposable results", async () => {
    respond(200, result("6"));
    expect(await verifyWithDebounce("key", "a@example.com")).toEqual({ ok: false, reason: "invalid", suggestion: null });
    respond(200, result("2"));
    expect(await verifyWithDebounce("key", "a@example.com")).toEqual({ ok: false, reason: "invalid", suggestion: null });
    respond(200, result("3"));
    expect(await verifyWithDebounce("key", "a@example.com")).toEqual({ ok: false, reason: "disposable", suggestion: null });
    respond(200, result("6", "a@example.org"));
    expect(await verifyWithDebounce("key", "a@example.com")).toEqual({ ok: false, reason: "invalid", suggestion: "a@example.org" });
  });

  test("lets accept-all and unknown results through", async () => {
    respond(200, result("4"));
    expect(await verifyWithDebounce("key", "a@example.com")).toEqual({ ok: true });
    respond(200, result("7"));
    expect(await verifyWithDebounce("key", "a@example.com")).toEqual({ ok: true });
  });

  test("fails open when DeBounce can't answer", async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      respond(402, { success: "0", debounce: { error: "Credits Low", code: "0" } });
      expect(await verifyWithDebounce("key", "a@example.com")).toEqual({ ok: true });
      globalThis.fetch = (async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch;
      expect(await verifyWithDebounce("key", "a@example.com")).toEqual({ ok: true });
    } finally {
      console.warn = warn;
    }
  });
});
