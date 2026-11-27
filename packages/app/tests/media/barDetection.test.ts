import { describe, expect, test } from "bun:test";
import { detectContentRect, type FramePixels } from "../../src/lib/media/crop/barDetection";

const WIDTH = 160;
const HEIGHT = 90;

/** A frame of black bars around a lit picture, with optional bright strips drawn on top. */
function frame(
    picture: { top: number; bottom: number; left?: number; right?: number },
    shade = 120,
    marks: Array<{ y: number; x0: number; x1: number }> = [],
): FramePixels {
    const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
    const left = picture.left ?? 0;
    const right = picture.right ?? WIDTH;
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            const inPicture = y >= picture.top && y < picture.bottom && x >= left && x < right;
            const marked = marks.some((mark) => mark.y === y && x >= mark.x0 && x < mark.x1);
            const value = marked ? 235 : inPicture ? shade + ((x * 7 + y * 3) % 40) : 4;
            data.set([value, value, value, 255], (y * WIDTH + x) * 4);
        }
    }
    return { data, width: WIDTH, height: HEIGHT };
}

const letterboxed = { top: 11, bottom: 79 };

describe("baked-in bar detection", () => {
    test("finds the letterbox of a widescreen film in a 16:9 file", () => {
        const rect = detectContentRect(Array.from({ length: 6 }, () => frame(letterboxed)));
        expect(rect?.top).toBeCloseTo(11 / HEIGHT, 3);
        expect(rect?.bottom).toBeCloseTo(79 / HEIGHT, 3);
        expect(rect?.left).toBe(0);
    });

    test("finds a pillarbox around 4:3 picture", () => {
        const rect = detectContentRect(Array.from({ length: 6 }, () => frame({ top: 0, bottom: HEIGHT, left: 20, right: 140 })));
        expect(rect?.left).toBeCloseTo(20 / WIDTH, 3);
        expect(rect?.top).toBe(0);
    });

    test("leaves full-frame video alone", () => {
        expect(detectContentRect(Array.from({ length: 6 }, () => frame({ top: 0, bottom: HEIGHT })))).toBeNull();
    });

    test("ignores dark frames and needs enough evidence", () => {
        const dark = frame({ top: 30, bottom: 60 }, 2);
        expect(detectContentRect([frame(letterboxed), frame(letterboxed), dark, dark, dark])).toBeNull();
        expect(detectContentRect([frame(letterboxed), frame(letterboxed), frame(letterboxed), frame(letterboxed), dark])).not.toBeNull();
    });

    test("keeps the taller picture of films that change shape", () => {
        const imax = frame({ top: 0, bottom: HEIGHT });
        expect(detectContentRect([frame(letterboxed), frame(letterboxed), frame(letterboxed), imax, frame(letterboxed)])).toBeNull();
    });

    test("keeps subtitles burned into a bar", () => {
        const subtitled = frame(letterboxed, 120, [{ y: 84, x0: 50, x1: 110 }]);
        const rect = detectContentRect([frame(letterboxed), subtitled, frame(letterboxed), frame(letterboxed)]);
        expect(rect?.bottom).toBeCloseTo(1 - 5 / HEIGHT, 3);
    });
});
