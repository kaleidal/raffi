import { afterEach, describe, expect, test } from "bun:test";
import {
	setRaffiSyncAuthFailureHandler,
	setRaffiSyncAuthRefreshHandler,
	setRaffiSyncAuthToken,
	syncGet,
} from "../src/lib/db/raffiSync";

const originalFetch = globalThis.fetch;

const token = (name: string) => {
	const header = btoa(JSON.stringify({ alg: "none" }));
	const payload = btoa(JSON.stringify({ name, exp: Math.floor(Date.now() / 1000) + 3600 }));
	return `${header}.${payload}.signature`;
};

afterEach(() => {
	globalThis.fetch = originalFetch;
	setRaffiSyncAuthToken(null);
	setRaffiSyncAuthRefreshHandler(null);
	setRaffiSyncAuthFailureHandler(null);
});

describe("Raffi Sync authentication", () => {
	test("shares one forced refresh across concurrent unauthorized requests", async () => {
		const oldToken = token("old");
		const newToken = token("new");
		const authorizations: string[] = [];
		let refreshes = 0;

		setRaffiSyncAuthToken(oldToken);
		setRaffiSyncAuthRefreshHandler(async () => {
			refreshes += 1;
			await Promise.resolve();
			return newToken;
		});
		globalThis.fetch = (async (_input, init) => {
			const authorization = new Headers(init?.headers).get("Authorization") || "";
			authorizations.push(authorization);
			if (authorization === `Bearer ${oldToken}`) {
				return new Response(null, { status: 401 });
			}
			return Response.json({ ok: true });
		}) as typeof fetch;

		const results = await Promise.all([
			syncGet<{ ok: boolean }>("/state"),
			syncGet<{ ok: boolean }>("/library"),
		]);

		expect(results).toEqual([{ ok: true }, { ok: true }]);
		expect(refreshes).toBe(1);
		expect(authorizations.filter((value) => value === `Bearer ${oldToken}`)).toHaveLength(2);
		expect(authorizations.filter((value) => value === `Bearer ${newToken}`)).toHaveLength(2);
	});

	test("invalidates the signed-in state when the refreshed token is rejected", async () => {
		const oldToken = token("old");
		const newToken = token("new");
		let refreshes = 0;
		let invalidations = 0;

		setRaffiSyncAuthToken(oldToken);
		setRaffiSyncAuthRefreshHandler(async () => {
			refreshes += 1;
			return newToken;
		});
		setRaffiSyncAuthFailureHandler(() => {
			invalidations += 1;
		});
		globalThis.fetch = (async () => new Response(null, { status: 401 })) as typeof fetch;

		await expect(syncGet("/state")).rejects.toThrow("Cloud session expired. Sign in again.");
		expect(refreshes).toBe(1);
		expect(invalidations).toBe(1);
	});

	test("invalidates the signed-in state when token refresh fails", async () => {
		let invalidations = 0;

		setRaffiSyncAuthToken(token("old"));
		setRaffiSyncAuthRefreshHandler(async () => {
			throw new Error("invalid_grant");
		});
		setRaffiSyncAuthFailureHandler(() => {
			invalidations += 1;
		});
		globalThis.fetch = (async () => new Response(null, { status: 401 })) as typeof fetch;

		await expect(syncGet("/state")).rejects.toThrow("Cloud session expired. Sign in again.");
		expect(invalidations).toBe(1);
	});

	test("does not treat a forbidden operation as an expired session", async () => {
		let refreshes = 0;
		let invalidations = 0;

		setRaffiSyncAuthToken(token("current"));
		setRaffiSyncAuthRefreshHandler(async () => {
			refreshes += 1;
			return token("unexpected");
		});
		setRaffiSyncAuthFailureHandler(() => {
			invalidations += 1;
		});
		globalThis.fetch = (async () => Response.json(
			{ error: "Join the party to view members" },
			{ status: 403 },
		)) as typeof fetch;

		await expect(syncGet("/watch-parties/example")).rejects.toThrow("Join the party to view members");
		expect(refreshes).toBe(0);
		expect(invalidations).toBe(0);
	});
});
