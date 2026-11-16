<script lang="ts">
	import { tick } from "svelte";
	import { Camera, Pencil } from "@lucide/svelte";
	import LoadingSpinner from "../../common/LoadingSpinner.svelte";
	import {
		changeAccountAvatar,
		currentUser,
		removeAccountAvatar,
		renameAccount,
	} from "../../../lib/stores/authStore";

	let fileInput: HTMLInputElement;
	let nameInput: HTMLInputElement;
	let editingName = false;
	let draftName = "";
	let savingName = false;
	let avatarBusy = false;
	let error = "";

	$: email = $currentUser?.email ?? "";
	$: displayName = $currentUser?.name || email.split("@")[0] || "";
	$: avatarInitial = displayName.slice(0, 1).toUpperCase();

	async function startEditingName() {
		draftName = $currentUser?.name ?? "";
		editingName = true;
		error = "";
		await tick();
		nameInput.select();
	}

	async function saveName() {
		if (savingName) return;
		savingName = true;
		error = "";
		try {
			await renameAccount(draftName);
			editingName = false;
		} catch (e: any) {
			error = e?.message || "Couldn't update your name";
		} finally {
			savingName = false;
		}
	}

	function handleNameKeydown(event: KeyboardEvent) {
		if (event.key === "Escape") {
			event.stopPropagation();
			editingName = false;
		}
	}

	async function handleAvatarPicked() {
		const file = fileInput.files?.[0];
		fileInput.value = "";
		if (!file) return;
		avatarBusy = true;
		error = "";
		try {
			await changeAccountAvatar(file);
		} catch (e: any) {
			error = e?.message || "Couldn't update your photo";
		} finally {
			avatarBusy = false;
		}
	}

	async function clearAvatar() {
		avatarBusy = true;
		error = "";
		try {
			await removeAccountAvatar();
		} catch (e: any) {
			error = e?.message || "Couldn't remove your photo";
		} finally {
			avatarBusy = false;
		}
	}
</script>

<div class="flex flex-col gap-3">
	<div class="flex items-center gap-4 min-w-0">
		<button
			type="button"
			class="group relative h-18 w-18 rounded-full bg-ink/9 overflow-hidden shrink-0 flex items-center justify-center text-ink text-2xl font-semibold cursor-pointer disabled:cursor-wait"
			aria-label="Change photo"
			disabled={avatarBusy}
			on:click={() => fileInput.click()}
		>
			{#if $currentUser?.avatar}
				<img src={$currentUser.avatar} alt={displayName} class="h-full w-full object-cover" />
			{:else}
				{avatarInitial}
			{/if}
			<span class="absolute inset-0 flex items-center justify-center bg-canvas/45 transition-opacity duration-200 {avatarBusy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}">
				{#if avatarBusy}
					<LoadingSpinner size="24px" />
				{:else}
					<Camera size={22} strokeWidth={2} />
				{/if}
			</span>
		</button>
		<input
			bind:this={fileInput}
			type="file"
			accept="image/*"
			class="hidden"
			on:change={handleAvatarPicked}
		/>

		<div class="min-w-0 flex-1">
			{#if editingName}
				<form class="flex flex-wrap items-center gap-2" on:submit|preventDefault={saveName}>
					<input
						bind:this={nameInput}
						bind:value={draftName}
						type="text"
						autocomplete="name"
						maxlength="64"
						placeholder={email.split("@")[0]}
						class="min-h-11 flex-1 min-w-40 rounded-2xl bg-ink/8 px-4 text-base text-ink outline-none placeholder:text-ink/30 focus:bg-ink/12"
						disabled={savingName}
						on:keydown={handleNameKeydown}
					/>
					<button
						type="submit"
						class="bg-accent text-on-accent px-4 py-2 rounded-full font-semibold hover:bg-accent/85 transition-colors cursor-pointer disabled:opacity-50"
						disabled={savingName}
					>
						{savingName ? "Saving..." : "Save"}
					</button>
					<button
						type="button"
						class="bg-ink/10 text-ink px-4 py-2 rounded-full font-semibold hover:bg-ink/20 transition-colors cursor-pointer"
						on:click={() => (editingName = false)}
					>
						Cancel
					</button>
				</form>
			{:else}
				<button
					type="button"
					class="group flex max-w-full items-center gap-2 text-left cursor-pointer"
					on:click={startEditingName}
				>
					<span class="text-ink text-2xl font-semibold truncate">{displayName}</span>
					<Pencil size={16} strokeWidth={2} class="shrink-0 text-ink/40 opacity-0 group-hover:opacity-100 transition-opacity" />
				</button>
			{/if}
			<p class="mt-1 text-ink/62 text-sm break-all">{email}</p>
			{#if $currentUser?.avatar && !editingName}
				<button
					type="button"
					class="mt-2 text-sm text-ink/50 hover:text-ink transition-colors cursor-pointer disabled:cursor-wait"
					disabled={avatarBusy}
					on:click={clearAvatar}
				>
					Remove photo
				</button>
			{/if}
		</div>
	</div>

	{#if error}
		<div class="p-3 rounded-2xl bg-danger/12 text-danger text-sm">{error}</div>
	{/if}
</div>
