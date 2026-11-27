<script lang="ts">
	import Button from "../../common/controls/Button.svelte";
	import Dialog from "../../common/dialog/Dialog.svelte";

	let { onChoose, onCancel }: { onChoose: (keepData: boolean) => void; onCancel: () => void } = $props();

	const choices = [
		{ keep: true, title: "Keep my data here", detail: "Copies your library and lists onto this device." },
		{ keep: false, title: "Start fresh", detail: "Clears the synced copy from this device." },
	];
</script>

<Dialog title="Sign out" onClose={onCancel}>
	<div class="flex flex-col gap-1">
		{#each choices as choice (choice.title)}
			<button
				class="cursor-pointer rounded-[20px] px-4 py-3.5 text-left transition-colors hover:bg-ink/8"
				onclick={() => onChoose(choice.keep)}
			>
				<span class="block font-semibold">{choice.title}</span>
				<span class="mt-0.5 block text-sm text-ink/55">{choice.detail}</span>
			</button>
		{/each}
	</div>

	{#snippet actions()}
		<Button onclick={onCancel}>Cancel</Button>
	{/snippet}
</Dialog>
