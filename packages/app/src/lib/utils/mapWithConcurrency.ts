export async function mapWithConcurrency<T, R>(
	items: readonly T[],
	concurrency: number,
	mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let nextIndex = 0;
	const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency)));
	await Promise.all(
		Array.from({ length: workerCount }, async () => {
			while (nextIndex < items.length) {
				const index = nextIndex++;
				results[index] = await mapper(items[index], index);
			}
		}),
	);
	return results;
}
