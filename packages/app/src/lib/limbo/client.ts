/** Limbo localhost companion client for torrent add/stream. */

export const LIMBO_DEFAULT_PORT = 17890;
export const LIMBO_INSTALL_URL = "https://limbo.kaleid.al";

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
	filePath: string | null;
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
		clearLimboDiscoveryCache();
		throw new LimboUnavailableError(
			error instanceof Error ? error.message : "Could not reach Limbo",
		);
	}
}

export async function checkLimboHealth(): Promise<LimboHealth | null> {
	try {
		const { baseUrl } = await resolveConnection();
		const response = await fetch(`${baseUrl}/v1/health`, {
			cache: "no-store",
		});
		if (!response.ok) return null;
		return (await response.json()) as LimboHealth;
	} catch {
		clearLimboDiscoveryCache();
		return null;
	}
}

export async function ensureLimboAvailable(): Promise<LimboHealth> {
	clearLimboDiscoveryCache();
	const health = await checkLimboHealth();
	if (!health?.ok) {
		throw new LimboUnavailableError(
			"Limbo is not running. Install and open Limbo to play torrent sources.",
		);
	}
	if (health.torrentReady === false) {
		throw new Error("Limbo torrent engine is not ready yet. Try again in a moment.");
	}
	return health;
}

export async function addLimboTorrent(input: {
	magnet: string;
	fileIndex?: number | null;
	sequential?: boolean;
	name?: string | null;
}): Promise<LimboTorrentStatus> {
	await ensureLimboAvailable();
	const response = await limboFetch("/v1/torrents", {
		method: "POST",
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
		throw new Error(text || `Limbo add torrent failed (${response.status})`);
	}

	return (await response.json()) as LimboTorrentStatus;
}

export async function getLimboTorrent(id: string): Promise<LimboTorrentStatus> {
	const response = await limboFetch(`/v1/torrents/${encodeURIComponent(id)}`);
	if (!response.ok) {
		const text = (await response.text().catch(() => "")).trim();
		throw new Error(text || `Limbo torrent status failed (${response.status})`);
	}
	return (await response.json()) as LimboTorrentStatus;
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

export async function waitForLimboReady(
	id: string,
	opts?: {
		timeoutMs?: number;
		pollMs?: number;
		onUpdate?: (status: LimboTorrentStatus) => void;
		signal?: AbortSignal;
	},
): Promise<LimboTorrentStatus> {
	const timeoutMs = opts?.timeoutMs ?? 120_000;
	const pollMs = opts?.pollMs ?? 1000;
	const started = Date.now();

	while (Date.now() - started < timeoutMs) {
		if (opts?.signal?.aborted) {
			throw new DOMException("Aborted", "AbortError");
		}
		const status = await getLimboTorrent(id);
		opts?.onUpdate?.(status);
		if (status.stage === "error" || status.lastError) {
			throw new Error(status.lastError || "Torrent error");
		}
		if (status.ready && status.streamUrl) {
			return status;
		}
		await new Promise((resolve) => setTimeout(resolve, pollMs));
	}

	throw new Error("Timed out waiting for Limbo torrent to become ready");
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
