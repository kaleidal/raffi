import { EncodedPacketSink, type InputVideoTrack } from "mediabunny";
import type { PreviewKeyframe } from "./matroskaKeyframes";

/**
 * Keyframes found through MediaBunny's own sample index. Each lookup also records the
 * interval up to the next keyframe, so later hovers inside it resolve synchronously.
 */
export class PacketKeyframes {
	private readonly packets: EncodedPacketSink;
	private starts: number[] = [];
	private ends = new Map<number, number>();

	constructor(track: InputVideoTrack) {
		this.packets = new EncodedPacketSink(track);
	}

	async keyframeAt(time: number): Promise<PreviewKeyframe | null> {
		const packet = await this.packets.getKeyPacket(time, { metadataOnly: true });
		if (!packet) return null;
		if (!this.ends.has(packet.timestamp)) {
			const next = await this.packets.getNextKeyPacket(packet, { metadataOnly: true });
			this.remember(packet.timestamp, next?.timestamp ?? Infinity);
		}
		return {
			timestamp: packet.timestamp,
			read: async () => (await this.packets.getKeyPacket(packet.timestamp))?.data ?? null,
		};
	}

	knownKeyframeAt(time: number) {
		let low = 0;
		let high = this.starts.length - 1;
		while (low <= high) {
			const middle = (low + high) >> 1;
			const start = this.starts[middle]!;
			if (time < start) high = middle - 1;
			else if (time >= this.ends.get(start)!) low = middle + 1;
			else return start;
		}
		return undefined;
	}

	private remember(start: number, end: number) {
		this.ends.set(start, end);
		let index = this.starts.length;
		while (index > 0 && this.starts[index - 1]! > start) index--;
		this.starts.splice(index, 0, start);
	}
}
