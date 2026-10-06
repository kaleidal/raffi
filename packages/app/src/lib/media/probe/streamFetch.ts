const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 8;
const FIRST_RETRY_DELAY_SECONDS = 0.5;
const MAX_RETRY_DELAY_SECONDS = 16;
const IDLE_BODY_TIMEOUT_MS = 15_000;

/** Observes the bytes of each response, given the absolute file offset it starts at. */
export type ResponseObserver = (start: number, body: ReadableStream<Uint8Array>) => ReadableStream<Uint8Array>;

export function isRetryableStatus(status: number) {
	return RETRYABLE_STATUSES.has(status);
}

function rangeStart(init: RequestInit | undefined, response: Response) {
	if (response.status !== 206) return 0;
	const contentRange = response.headers.get("content-range")?.match(/bytes\s+(\d+)-/i);
	if (contentRange) return Number(contentRange[1]);
	const requested = new Headers(init?.headers).get("range")?.match(/bytes=(\d+)-/i);
	return requested ? Number(requested[1]) : 0;
}

/**
 * Debrid hosts drop connections and answer with transient errors under load. MediaBunny
 * only retries thrown errors and treats cross-origin network failures as CORS, so this
 * turns retryable statuses into errors and retries everything a bounded number of times.
 */
export function streamRetryDelay(previousAttempts: number): number | null {
	if (previousAttempts > MAX_RETRIES) return null;
	return Math.min(FIRST_RETRY_DELAY_SECONDS * 2 ** (previousAttempts - 1), MAX_RETRY_DELAY_SECONDS);
}

/**
 * Errors a response body that stops delivering data while a read is waiting, so a
 * connection the host silently dropped is retried instead of hanging forever.
 */
function failWhenIdle(body: ReadableStream<Uint8Array>) {
	const reader = body.getReader();
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			let timer: ReturnType<typeof setTimeout> | undefined;
			const idle = new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error("Stream host stopped sending data")), IDLE_BODY_TIMEOUT_MS);
			});
			try {
				const { done, value } = await Promise.race([reader.read(), idle]);
				if (done) controller.close();
				else controller.enqueue(value);
			} catch (error) {
				void reader.cancel().catch(() => {});
				controller.error(error);
			} finally {
				clearTimeout(timer);
			}
		},
		cancel: (reason) => reader.cancel(reason),
	});
}

export function createStreamFetch(observe: ResponseObserver): typeof fetch {
	return (async (input: RequestInfo | URL, init?: RequestInit) => {
		const response = await fetch(input, init);
		if (isRetryableStatus(response.status)) {
			void response.body?.cancel().catch(() => {});
			throw new Error(`Stream host responded with ${response.status}`);
		}
		if (!response.ok || !response.body) return response;

		const observed = new Response(observe(rangeStart(init, response), failWhenIdle(response.body)), {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		});
		Object.defineProperties(observed, {
			url: { value: response.url },
			redirected: { value: response.redirected },
		});
		return observed;
	}) as typeof fetch;
}
