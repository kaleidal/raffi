const isGzip = (bytes: Uint8Array | undefined) => bytes?.[0] === 0x1f && bytes[1] === 0x8b;

/** Gzipped files are common for guides and rarely labelled as such, so the first bytes decide. */
async function decompressed(body: ReadableStream<Uint8Array>) {
	const reader = body.getReader();
	const first = await reader.read();
	const replay = new ReadableStream<Uint8Array>({
		start(controller) {
			if (first.done) controller.close();
			else controller.enqueue(first.value);
		},
		async pull(controller) {
			const next = await reader.read();
			if (next.done) controller.close();
			else controller.enqueue(next.value);
		},
		cancel: (reason) => reader.cancel(reason),
	});
	return isGzip(first.value) ? replay.pipeThrough(new DecompressionStream("gzip") as ReadableWritablePair<Uint8Array, Uint8Array>) : replay;
}

export async function readText(body: ReadableStream<Uint8Array>, onText: (text: string) => void) {
	const reader = (await decompressed(body)).getReader();
	const decoder = new TextDecoder();
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		onText(decoder.decode(value, { stream: true }));
	}
	const rest = decoder.decode();
	if (rest) onText(rest);
}

export async function readLines(body: ReadableStream<Uint8Array>, onLine: (line: string) => void) {
	let rest = "";
	await readText(body, (text) => {
		const lines = (rest + text).split("\n");
		rest = lines.pop()!;
		for (const line of lines) onLine(line);
	});
	if (rest) onLine(rest);
}

export async function readJson<T>(body: ReadableStream<Uint8Array>): Promise<T> {
	let text = "";
	await readText(body, (chunk) => {
		text += chunk;
	});
	return JSON.parse(text);
}
