import { openWatchPartySocket } from "../db/db";

export type PlaybackState = { position: number; playing: boolean; at: number };

export type EndReason = "host_left" | "expired" | "gone";

type ServerMessage =
	| { type: "welcome"; host: boolean; state: PlaybackState; members: number }
	| { type: "pong"; sent: number; server: number }
	| { type: "state"; state: PlaybackState }
	| { type: "members"; count: number }
	| { type: "ended"; reason: "host_left" | "expired" };

export type PartyEvents = {
	onWelcome: (host: boolean, state: PlaybackState, members: number) => void;
	onState: (state: PlaybackState) => void;
	onMembers: (count: number) => void;
	onEnded: (reason: EndReason) => void;
	/** Asked after a failed reconnect, since a refused upgrade can't say whether the party is gone. */
	partyExists: () => Promise<boolean>;
};

const CLOCK_SAMPLES = 5;
const CLOCK_RESYNC_MS = 30_000;
const RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000];

const localNow = () => performance.timeOrigin + performance.now();

/**
 * Keeps a live connection to a party and an estimate of the server's clock,
 * so a guest can tell where the host is right now rather than when a message left.
 */
export function connectToParty(partyId: string, events: PartyEvents) {
	let socket: WebSocket | null = null;
	let closed = false;
	let retries = 0;
	let retryTimer: ReturnType<typeof setTimeout> | null = null;
	let resyncTimer: ReturnType<typeof setInterval> | null = null;
	let clockOffset = 0;
	let bestRoundTrip = Infinity;

	const send = (message: object) => {
		if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
	};

	const sampleClock = () => {
		bestRoundTrip = Infinity;
		for (let sample = 0; sample < CLOCK_SAMPLES; sample += 1) send({ type: "ping", sent: performance.now() });
	};

	/** The sample with the shortest round trip has the least room for error, so it sets the offset. */
	const takePong = (sent: number, server: number) => {
		const roundTrip = performance.now() - sent;
		if (roundTrip >= bestRoundTrip) return;
		bestRoundTrip = roundTrip;
		clockOffset = server + roundTrip / 2 - localNow();
	};

	const handle = (message: ServerMessage) => {
		switch (message.type) {
			case "welcome":
				retries = 0;
				events.onWelcome(message.host, message.state, message.members);
				break;
			case "pong":
				takePong(message.sent, message.server);
				break;
			case "state":
				events.onState(message.state);
				break;
			case "members":
				events.onMembers(message.count);
				break;
			case "ended":
				end(message.reason);
				break;
		}
	};

	const end = (reason: EndReason) => {
		closed = true;
		events.onEnded(reason);
	};

	const reconnectLater = () => {
		if (closed || retryTimer) return;
		const delay = RETRY_DELAYS_MS[Math.min(retries, RETRY_DELAYS_MS.length - 1)];
		retries += 1;
		retryTimer = setTimeout(async () => {
			retryTimer = null;
			if (retries > 1 && !(await events.partyExists().catch(() => true))) end("gone");
			else if (!closed) void open();
		}, delay);
	};

	const open = async () => {
		let next: WebSocket;
		try {
			next = await openWatchPartySocket(partyId);
		} catch {
			reconnectLater();
			return;
		}
		if (closed) {
			next.close();
			return;
		}
		socket = next;
		next.onopen = sampleClock;
		next.onmessage = ({ data }) => handle(JSON.parse(data));
		next.onclose = () => {
			if (socket === next) socket = null;
			reconnectLater();
		};
	};

	void open();
	resyncTimer = setInterval(sampleClock, CLOCK_RESYNC_MS);

	return {
		sendState: (position: number, playing: boolean) => send({ type: "state", position, playing }),
		/** Where a playback state has got to by now, in seconds. */
		positionOf: (state: PlaybackState) =>
			state.playing ? state.position + (localNow() + clockOffset - state.at) / 1000 : state.position,
		close() {
			closed = true;
			if (retryTimer) clearTimeout(retryTimer);
			if (resyncTimer) clearInterval(resyncTimer);
			socket?.close(1000);
			socket = null;
		},
	};
}

export type PartyConnection = ReturnType<typeof connectToParty>;
