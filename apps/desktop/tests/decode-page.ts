import { ALL_FORMATS, AudioSampleSink, Input, UrlSource } from "mediabunny";
import { registerDtsDecoder } from "@mediabunny/dts";
import { registerTrueHdDecoder } from "@mediabunny/truehd";

registerDtsDecoder();
registerTrueHdDecoder();

async function decodeFirstSecond(fixture: string) {
	const input = new Input({ source: new UrlSource(`/fixtures/${fixture}`), formats: ALL_FORMATS });
	const tracks = [];
	for (const track of await input.getAudioTracks()) {
		let decodedFrames = 0;
		let channels = 0;
		for await (const sample of new AudioSampleSink(track).samples(0, 1)) {
			decodedFrames += sample.numberOfFrames;
			channels = sample.numberOfChannels;
			sample.close();
		}
		tracks.push({ fixture, codec: await track.getCodec(), channels, decoded: decodedFrames > 0 });
	}
	input.dispose();
	return tracks;
}

Object.assign(window, {
	decodeFixtures: async (fixtures: string[]) => (await Promise.all(fixtures.map(decodeFirstSecond))).flat(),
});
