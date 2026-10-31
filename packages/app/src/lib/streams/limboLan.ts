/** Finds and pairs with Limbo on another computer on the local network, for the TV app. */

import { get, writable } from "svelte/store";
import { hostFetch } from "../shell/hostFetch";
import { requestNative } from "../tv/bridge";

const PAIRING_KEY = "raffi_limbo_pairing";
const LIMBO_PORT = 17890;

export type LimboPairing = {
	instanceId: string;
	name: string;
	baseUrl: string;
	token: string;
};

export type DiscoveredLimbo = {
	id: string;
	name: string;
	baseUrl: string;
};

const readPairing = (): LimboPairing | null => {
	try {
		return JSON.parse(localStorage.getItem(PAIRING_KEY) ?? "null");
	} catch {
		return null;
	}
};

export const limboPairing = writable<LimboPairing | null>(readPairing());

limboPairing.subscribe((pairing) => {
	try {
		if (pairing) localStorage.setItem(PAIRING_KEY, JSON.stringify(pairing));
		else localStorage.removeItem(PAIRING_KEY);
	} catch {
		// The pairing still works for this session when storage is unavailable.
	}
});

export const allowLocalNetwork = async () =>
	(await requestNative<{ granted: boolean }>({ type: "lan.permit" })).granted;

export async function discoverLimbo(): Promise<DiscoveredLimbo[]> {
	if (!(await allowLocalNetwork())) return [];
	return (await requestNative<{ services: DiscoveredLimbo[] }>({ type: "limbo.discover" })).services;
}

/** Turns what someone typed, like `192.168.1.20` or `pc.local:17890`, into a base URL. */
export function limboAddressToBaseUrl(address: string): string | null {
	const trimmed = address.trim().replace(/\/+$/, "");
	if (!trimmed) return null;
	try {
		const url = new URL(/^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`);
		if (!url.port) url.port = String(LIMBO_PORT);
		return url.origin;
	} catch {
		return null;
	}
}

export async function pairLimbo(baseUrl: string, code: string): Promise<LimboPairing> {
	if (!(await allowLocalNetwork())) {
		throw new Error("Raffi needs access to your local network to pair with Limbo.");
	}
	const { name: deviceName } = await requestNative<{ name: string }>({ type: "device.info" });
	let response: Response;
	try {
		response = await hostFetch(`${baseUrl}/v1/pair`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code, deviceName }),
		});
	} catch {
		throw new Error("Couldn't reach Limbo at that address.");
	}
	const body = (await response.json().catch(() => null)) as
		| { token?: string; instanceId?: string; name?: string; message?: string }
		| null;
	if (!response.ok || !body?.token || !body.instanceId) {
		throw new Error(body?.message || "Limbo didn't accept the pairing request.");
	}
	const pairing = { instanceId: body.instanceId, name: body.name || "Limbo", baseUrl, token: body.token };
	limboPairing.set(pairing);
	return pairing;
}

export async function forgetLimbo() {
	const pairing = get(limboPairing);
	limboPairing.set(null);
	if (!pairing) return;
	await hostFetch(`${pairing.baseUrl}/v1/pair`, {
		method: "DELETE",
		headers: { Authorization: `Bearer ${pairing.token}` },
	}).catch(() => undefined);
}

/** Looks for the paired Limbo again, in case the computer's address changed. */
export async function relocateLimbo(pairing: LimboPairing): Promise<LimboPairing | null> {
	const found = (await discoverLimbo()).find((service) => service.id === pairing.instanceId);
	if (!found) return null;
	const moved = { ...pairing, name: found.name, baseUrl: found.baseUrl };
	limboPairing.set(moved);
	return moved;
}
