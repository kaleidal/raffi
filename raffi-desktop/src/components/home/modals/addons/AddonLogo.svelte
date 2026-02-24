<script lang="ts">
	export let src: string | null | undefined = null;
	export let name: string | null | undefined = null;
	export let sizeClass = "w-12 h-12";

	let failed = false;

	$: normalizedSrc = String(src || "").trim();
	$: if (normalizedSrc) {
		failed = false;
	}
	$: initials = String(name || "?")
		.trim()
		.split(/\s+/)
		.map((part) => part.charAt(0))
		.join("")
		.slice(0, 2)
		.toUpperCase() || "?";

	function handleError() {
		failed = true;
	}
</script>

{#if normalizedSrc && !failed}
	<img
		src={normalizedSrc}
		alt={`${name || "Addon"} logo`}
		class={`${sizeClass} object-contain rounded-xl bg-white/5 shrink-0`}
		on:error={handleError}
	/>
{:else}
	<div
		class={`${sizeClass} rounded-xl bg-white/[0.08] border border-white/10 shrink-0 flex items-center justify-center`}
		aria-label={`${name || "Addon"} placeholder logo`}
	>
		<span class="text-white/65 text-xs font-semibold tracking-[0.14em]">{initials}</span>
	</div>
{/if}
