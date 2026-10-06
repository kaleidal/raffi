/** Limbo localhost companion client for torrent add/stream. */

export const LIMBO_DEFAULT_PORT = 17890;
export const LIMBO_INSTALL_URL = "https://limbo.kaleid.al";
export const LIMBO_MIN_API_VERSION = 2;
const LIMBO_DEFAULT_BASE_URL = `http://127.0.0.1:${LIMBO_DEFAULT_PORT}`;

const RAFFI_ICON_DATA_URL =
	"data:image/svg+xml," +
	encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#111"/><text x="32" y="42" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700" fill="#fff">R</text></svg>`,
	);

export type LimboHealth = {
	ok: boolean;
	service?: string;
	version?: string;
	apiVersion?: number;
	torrentReady?: boolean;
	apiTokenRequired?: boolean;
};

export type LimboTorrentFile = {
	index: number;
	name: string;
	path: string;
	length: number;
	downloaded: number;
	progress: number;
};

export type LimboTorrentStatus = {
	id: string;
	infoHash: string | null;
	name: string;
	status: string;
	stage: "metadata" | "downloading" | "ready" | "done" | "error";
	progress: number;
	downloadSpeed: number;
	uploadSpeed: number;
	peers: number;
	seeds: number;
	size: number;
	downloaded: number;
	files: LimboTorrentFile[];
	selectedFileIndex: number | null;
	streamUrl: string | null;
	ready: boolean;
	contiguousBytes: number;
	clientId: string | null;
	lastError: string | null;
};

export class LimboUnavailableError extends Error {
	constructor(message = "Limbo is not running") {
		super(message);
		this.name = "LimboUnavailableError";
	}
}

export class LimboApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly code?: string,
	) {
		super(message);
		this.name = "LimboApiError";
	}
}

type LimboDiscovery = {
	port?: number;
	token?: string;
	baseUrl?: string;
};

let cachedDiscovery: LimboDiscovery | null | undefined;
let cachedBaseUrl: string | null = null;
let cachedToken: string | null = null;

function getElectronApi():
	| {
			readLimboApiDiscovery?: () => Promise<LimboDiscovery | null>;
			openExternal?: (url: string) => void | Promise<unknown>;
	  }
	| undefined {
	if (typeof window === "undefined") return undefined;
	return (window as { electronAPI?: {
		readLimboApiDiscovery?: () => Promise<LimboDiscovery | null>;
		openExternal?: (url: string) => void | Promise<unknown>;
	} }).electronAPI;
}

async function loadDiscovery(): Promise<LimboDiscovery | null> {
	if (cachedDiscovery !== undefined) return cachedDiscovery;
	try {
		const api = getElectronApi();
		if (api?.readLimboApiDiscovery) {
			cachedDiscovery = (await api.readLimboApiDiscovery()) || null;
			return cachedDiscovery;
		}
	} catch {
		// ignore
	}
	cachedDiscovery = null;
	return null;
}

export function clearLimboDiscoveryCache() {
	cachedDiscovery = undefined;
	cachedBaseUrl = null;
	cachedToken = null;
}

async function resolveConnection(): Promise<{ baseUrl: string; token: string }> {
	if (cachedBaseUrl && cachedToken) {
		return { baseUrl: cachedBaseUrl, token: cachedToken };
	}

	const discovery = await loadDiscovery();
	const port =
		typeof discovery?.port === "number" && discovery.port > 0
			? discovery.port
			: LIMBO_DEFAULT_PORT;
	const baseUrl =
		typeof discovery?.baseUrl === "string" && discovery.baseUrl
			? discovery.baseUrl.replace(/\/$/, "")
			: `http://127.0.0.1:${port}`;
	const token = typeof discovery?.token === "string" ? discovery.token : "";

	cachedBaseUrl = baseUrl;
	cachedToken = token;
	return { baseUrl, token };
}

async function limboFetch(path: string, init: RequestInit = {}): Promise<Response> {
	const { baseUrl, token } = await resolveConnection();
	const headers = new Headers(init.headers);
	if (token) {
		headers.set("Authorization", `Bearer ${token}`);
	}
	if (init.body && !headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json");
	}

	try {
		return await fetch(`${baseUrl}${path}`, {
			...init,
			headers,
		});
	} catch (error) {
		if (init.signal?.aborted) throw error;
		clearLimboDiscoveryCache();
		throw new LimboUnavailableError(
			error instanceof Error ? error.message : "Could not reach Limbo",
		);
	}
}

async function fetchLimboHealth(
	baseUrl: string,
	signal?: AbortSignal,
): Promise<LimboHealth | null> {
	try {
		const response = await fetch(`${baseUrl}/v1/health`, {
			cache: "no-store",
			signal,
		});
		if (!response.ok) return null;
		const health = (await response.json()) as LimboHealth;
		return health?.ok && health.service === "limbo" ? health : null;
	} catch (error) {
		if (signal?.aborted) throw error;
		return null;
	}
}

export async function checkLimboHealth(signal?: AbortSignal): Promise<LimboHealth | null> {
	const { baseUrl } = await resolveConnection();
	const discoveredHealth = await fetchLimboHealth(baseUrl, signal);
	if (discoveredHealth) return discoveredHealth;

	if (baseUrl !== LIMBO_DEFAULT_BASE_URL) {
		const defaultHealth = await fetchLimboHealth(LIMBO_DEFAULT_BASE_URL, signal);
		if (defaultHealth) {
			cachedBaseUrl = LIMBO_DEFAULT_BASE_URL;
			return defaultHealth;
		}
	}

	clearLimboDiscoveryCache();
	return null;
}

export async function ensureLimboAvailable(signal?: AbortSignal): Promise<LimboHealth> {
	clearLimboDiscoveryCache();
	const health = await checkLimboHealth(signal);
	if (!health?.ok) {
		throw new LimboUnavailableError(
			"Limbo is not running. Install and open Limbo to play torrent sources.",
		);
	}
	assertLimboCompatible(health);
	return health;
}

export function assertLimboCompatible(health: LimboHealth): void {
	if (
		typeof health.apiVersion !== "number" ||
		health.apiVersion < LIMBO_MIN_API_VERSION
	) {
		throw new LimboUnavailableError(
			"This version of Limbo is too old for Raffi. Update Limbo and try again.",
		);
	}
	if (health.torrentReady === false) {
		throw new Error("Limbo torrent engine is not ready yet. Try again in a moment.");
	}
}

export async function addLimboTorrent(input: {
	magnet: string;
	fileIndex?: number | null;
	sequential?: boolean;
	name?: string | null;
}, signal?: AbortSignal): Promise<LimboTorrentStatus> {
	await ensureLimboAvailable(signal);
	const response = await limboFetch("/v1/torrents", {
		method: "POST",
		signal,
		body: JSON.stringify({
			magnet: input.magnet,
			fileIndex: input.fileIndex ?? undefined,
			sequential: input.sequential !== false,
			name: input.name?.trim() || undefined,
			clientId: "raffi",
			clientName: "Raffi",
			clientVersion: "desktop",
			clientIconDataUrl: RAFFI_ICON_DATA_URL,
		}),
	});

	if (!response.ok) {
		const text = (await response.text().catch(() => "")).trim();
		if (response.status === 401) {
			clearLimboDiscoveryCache();
			throw new LimboUnavailableError(
				"Limbo rejected Raffi's API token. Open Limbo once so it can refresh api.json.",
			);
		}
		if (response.status === 403) {
			let body: { error?: string; message?: string } | null = null;
			try {
				body = JSON.parse(text) as { error?: string; message?: string };
			} catch {
				body = null;
			}
			if (body?.error === "APPROVAL_DENIED") {
				throw new Error(body.message || "Torrent request was denied in Limbo");
			}
			if (body?.error === "VPN_REQUIRED") {
				throw new Error(
					body.message ||
						"Limbo requires a VPN for torrents. Connect a VPN in Limbo settings.",
				);
			}
		}
		throw apiError(response.status, text, "Limbo add torrent failed");
	}

	const created = parseLimboTorrentStatus(await response.json());
	if (signal?.aborted) {
		await removeLimboTorrent(created.id, false);
		throw new DOMException("Torrent request canceled", "AbortError");
	}
	return created;
}

export async function getLimboTorrent(
	id: string,
	signal?: AbortSignal,
): Promise<LimboTorrentStatus> {
	const response = await limboFetch(`/v1/torrents/${encodeURIComponent(id)}`, {
		signal,
	});
	if (!response.ok) {
		const text = (await response.text().catch(() => "")).trim();
		throw apiError(response.status, text, "Limbo torrent status failed");
	}
	return parseLimboTorrentStatus(await response.json());
}

export async function removeLimboTorrent(id: string, deleteFiles = false): Promise<void> {
	try {
		await limboFetch(
			`/v1/torrents/${encodeURIComponent(id)}?deleteFiles=${deleteFiles ? "true" : "false"}`,
			{ method: "DELETE" },
		);
	} catch {
		// Best-effort cleanup.
	}
}

export async function openLimboInstallPage(): Promise<void> {
	const api = getElectronApi();
	if (api?.openExternal) {
		await api.openExternal(LIMBO_INSTALL_URL);
		return;
	}
	if (typeof window !== "undefined") {
		window.open(LIMBO_INSTALL_URL, "_blank", "noopener,noreferrer");
	}
}

function apiError(status: number, text: string, fallback: string): LimboApiError {
	let code: string | undefined;
	let message = text;
	try {
		const body = JSON.parse(text) as { error?: unknown; message?: unknown };
		if (typeof body.error === "string") code = body.error;
		if (typeof body.message === "string") message = body.message;
	} catch {}
	return new LimboApiError(message || `${fallback} (${status})`, status, code);
}

export function parseLimboTorrentStatus(value: unknown): LimboTorrentStatus {
	if (!value || typeof value !== "object") {
		throw new LimboApiError("Limbo returned an invalid torrent status. Update Limbo and try again.", 502);
	}
	const status = value as Partial<LimboTorrentStatus>;
	const validStage = ["metadata", "downloading", "ready", "done", "error"].includes(
		String(status.stage),
	);
	if (
		typeof status.id !== "string" ||
		!status.id ||
		!validStage ||
		typeof status.ready !== "boolean" ||
		!Array.isArray(status.files)
	) {
		throw new LimboApiError("Limbo returned an incompatible torrent status. Update Limbo and try again.", 502);
	}
	return status as LimboTorrentStatus;
}
