import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { identifyYoutubeRequest } = require("../electron/services/contentBlocker.cjs");

describe("YouTube desktop client identity", () => {
	test("adds Raffi's HTTPS identity to YouTube embed requests", () => {
		expect(identifyYoutubeRequest({
			url: "https://www.youtube-nocookie.com/embed/video",
			requestHeaders: { Accept: "text/html" },
		})).toEqual({
			Accept: "text/html",
			Referer: "https://raffi.al/",
		});
	});

	test("does not modify unrelated requests", () => {
		const requestHeaders = { Accept: "application/json" };
		expect(identifyYoutubeRequest({
			url: "https://api.example.com/video",
			requestHeaders,
		})).toBe(requestHeaders);
	});
});
