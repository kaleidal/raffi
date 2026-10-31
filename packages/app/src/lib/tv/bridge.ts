/** Message channel to the Android TV host, injected as `window.raffiTv`. */

type NativeMessage = { type: string } & Record<string, unknown>;
type Listener = (message: any) => void;

declare global {
	interface Window {
		raffiTv?: {
			postMessage: (message: string) => void;
			onmessage: ((event: { data: string }) => void) | null;
		};
	}
}

const listeners = new Map<string, Set<Listener>>();
const pendingRequests = new Map<number, (message: any) => void>();
let nextRequestId = 0;

export function startBridge() {
	window.raffiTv!.onmessage = (event) => {
		const message = JSON.parse(event.data) as NativeMessage;
		if (message.type === "response") {
			const id = message.id as number;
			pendingRequests.get(id)?.(message);
			pendingRequests.delete(id);
			return;
		}
		listeners.get(message.type)?.forEach((listener) => listener(message));
	};
	sendNative({ type: "ready" });
}

export function sendNative(message: NativeMessage) {
	window.raffiTv?.postMessage(JSON.stringify(message));
}

/** Sends a message the host answers with a `response` carrying the same id. */
export function requestNative<T>(message: NativeMessage): Promise<T> {
	const id = ++nextRequestId;
	return new Promise((resolve) => {
		pendingRequests.set(id, resolve);
		sendNative({ ...message, id });
	});
}

export function onNative<T = NativeMessage>(type: string, listener: (message: T) => void) {
	let set = listeners.get(type);
	if (!set) {
		set = new Set();
		listeners.set(type, set);
	}
	set.add(listener);
	return () => {
		set.delete(listener);
	};
}
