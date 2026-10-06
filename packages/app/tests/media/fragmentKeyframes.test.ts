import { describe, expect, test } from "bun:test";
import {
	ALL_FORMATS,
	BufferSource,
	BufferTarget,
	Conversion,
	EncodedPacketSink,
	Input,
	Mp4OutputFormat,
	Output,
} from "mediabunny";
import { FragmentKeyframes } from "../../src/lib/media/playback/mse/fragmentKeyframes";

const fixtureUrl = new URL("../../../../apps/desktop/tests/fixtures/h264-aac-dts.mkv", import.meta.url);

async function remuxToFragments(fixture: Uint8Array) {
	const target = new BufferTarget();
	const conversion = await Conversion.init({
		input: new Input({ source: new BufferSource(fixture), formats: ALL_FORMATS }),
		output: new Output({
			format: new Mp4OutputFormat({ fastStart: "fragmented", minimumFragmentDuration: 0.5 }),
			target,
		}),
		audio: { discard: true },
		showWarnings: false,
	});
	await conversion.execute();
	return new Uint8Array(target.buffer!);
}

async function sourceKeyframes(fixture: Uint8Array) {
	const input = new Input({ source: new BufferSource(fixture), formats: ALL_FORMATS });
	const sink = new EncodedPacketSink((await input.getPrimaryVideoTrack())!);
	const times: number[] = [];
	for (let packet = await sink.getFirstPacket(); packet; packet = await sink.getNextKeyPacket(packet)) {
		if (packet.type === "key") times.push(packet.timestamp);
	}
	return times;
}

describe("fragment keyframes", () => {
	test("finds the source keyframes in remuxed fragments split at arbitrary byte boundaries", async () => {
		const fixture = await Bun.file(fixtureUrl).bytes();
		const fragments = await remuxToFragments(fixture);
		const keyframes = new FragmentKeyframes();
		const offset = 100;
		const scanner = keyframes.scanner(offset);
		for (let position = 0; position < fragments.byteLength; position += 977) {
			scanner.push(fragments.subarray(position, position + 977));
		}

		const expected = await sourceKeyframes(fixture);
		expect(expected.length).toBeGreaterThan(1);
		expect(keyframes.cutPoint(offset - 1)).toBeNull();
		for (const time of expected) {
			expect(keyframes.cutPoint(offset + time + 0.001)).toBeCloseTo(offset + time, 3);
		}
	});

	test("forgets keyframes of removed media", async () => {
		const fixture = await Bun.file(fixtureUrl).bytes();
		const keyframes = new FragmentKeyframes();
		keyframes.scanner(0).push(await remuxToFragments(fixture));
		const [, second] = await sourceKeyframes(fixture);

		keyframes.forget(0, second!);
		expect(keyframes.cutPoint(second! - 0.001)).toBeNull();
		expect(keyframes.cutPoint(second!)).toBeCloseTo(second!, 3);
	});
});
