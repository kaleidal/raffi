import { describe, expect, test } from "bun:test";
import {
    getStartupSkipTarget,
    shouldAutoSkipChapter,
} from "../src/pages/player/chapters";
import type { Chapter } from "../src/pages/player/types";

const recap: Chapter = {
    startTime: 0,
    endTime: 30,
    title: "Previously on",
    kind: "recap",
    source: "native",
};

const intro: Chapter = {
    startTime: 30.1,
    endTime: 60,
    title: "Opening",
    kind: "intro",
    source: "native",
};

describe("chapter auto-skip preference", () => {
    test("keeps intros and recaps when disabled", () => {
        expect(shouldAutoSkipChapter(recap, false)).toBe(false);
        expect(shouldAutoSkipChapter(intro, false)).toBe(false);
        expect(getStartupSkipTarget(0, [recap, intro], false)).toBe(0);
    });

    test("skips consecutive recaps and intros when enabled", () => {
        expect(shouldAutoSkipChapter(recap, true)).toBe(true);
        expect(shouldAutoSkipChapter(intro, true)).toBe(true);
        expect(getStartupSkipTarget(0, [recap, intro], true)).toBe(60.1);
    });
});
