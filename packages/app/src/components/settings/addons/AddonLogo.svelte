<script lang="ts">
	let {
		src = null,
		name = null,
		sizeClass = "w-12 h-12",
	}: {
		src?: string | null;
		name?: string | null;
		sizeClass?: string;
	} = $props();

	let failedSrc = $state<string | null>(null);

	const normalizedSrc = $derived(String(src || "").trim());
	const failed = $derived(failedSrc === normalizedSrc);
	const initials = $derived(
		String(name || "?")
			.trim()
			.split(/\s+/)
			.map((part) => part.charAt(0))
			.join("")
			.slice(0, 2)
			.toUpperCase() || "?",
	);
</script>

{#if normalizedSrc && !failed}
	<img
		src={normalizedSrc}
		alt={`${name || "Addon"} logo`}
		class={`${sizeClass} object-contain rounded-xl bg-ink/5 shrink-0`}
		onerror={() => (failedSrc = normalizedSrc)}
	/>
{:else}
	<div
		class={`${sizeClass} rounded-xl bg-ink/[0.08] border border-ink/10 shrink-0 flex items-center justify-center`}
		aria-label={`${name || "Addon"} placeholder logo`}
	>
		<span class="text-ink/65 text-xs font-semibold tracking-[0.14em]">{initials}</span>
	</div>
{/if}
