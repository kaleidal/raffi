import { EncodedPacketSink, type InputVideoTrack } from "mediabunny";

export async function snapToVideoKeyframe(
	videoTrack: InputVideoTrack,
	startTime: number,
): Promise<number> {
	if (!(startTime > 0)) return 0;
	try {
		const sink = new EncodedPacketSink(videoTrack);
		const keyPacket = await sink.getKeyPacket(startTime, {
			verifyKeyPackets: true,
		});
		if (!keyPacket || !Number.isFinite(keyPacket.timestamp)) {
			const unverified = await sink.getKeyPacket(startTime);
			if (!unverified || !Number.isFinite(unverified.timestamp)) return startTime;
			return Math.max(0, unverified.timestamp);
		}
		return Math.max(0, keyPacket.timestamp);
	} catch (error) {
		console.warn("Failed to snap remux start to keyframe", error);
		return startTime;
	}
}
