export class RemoteBytes {
	private cache = new Map<string, Uint8Array>();
	private constructor(
		readonly url: string,
		public size: number | null,
		private signal?: AbortSignal,
	) {}

	static open(url: string, signal?: AbortSignal): RemoteBytes {
		return new RemoteBytes(url, null, signal);
	}

	async read(start: number, length: number): Promise<Uint8Array> {
		if (length <= 0) return new Uint8Array();
		const end = start + length - 1;
		const key = `${start}:${end}`;
		const cached = this.cache.get(key);
		if (cached) return cached;

		const response = await fetch(this.url, {
			headers: { Range: `bytes=${start}-${end}` },
			signal: this.signal,
		});
		if (!(response.ok || response.status === 206)) {
			throw new Error(`Range request failed (${response.status})`);
		}
		const buffer = new Uint8Array(await response.arrayBuffer());
		this.cache.set(key, buffer);

		if (this.size == null) {
			const match = response.headers.get("content-range")?.match(/\/(\d+)\s*$/);
			if (match) this.size = Number(match[1]);
		}
		return buffer;
	}

	close() {
		this.cache.clear();
	}
}
