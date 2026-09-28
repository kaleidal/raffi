<script lang="ts">
	import { onDestroy } from "svelte";
	import CodeInput from "../../../../common/CodeInput.svelte";
	import { sendSignInCode, signInWithCode } from "../../../../../lib/stores/authStore";

	export let onSignedIn: () => void | Promise<void> = () => {};

	const RESEND_DELAY_SECONDS = 30;

	let step: "email" | "code" = "email";
	let email = "";
	let code = "";
	let busy = false;
	let error = "";
	let resendIn = 0;
	let resendTimer: ReturnType<typeof setInterval> | null = null;

	const stopResendTimer = () => {
		if (resendTimer) clearInterval(resendTimer);
		resendTimer = null;
	};

	const startResendTimer = () => {
		stopResendTimer();
		resendIn = RESEND_DELAY_SECONDS;
		resendTimer = setInterval(() => {
			resendIn -= 1;
			if (resendIn <= 0) stopResendTimer();
		}, 1000);
	};

	async function sendCode() {
		if (busy || !email.trim()) return;
		busy = true;
		error = "";
		try {
			await sendSignInCode(email);
			code = "";
			step = "code";
			startResendTimer();
		} catch (e: any) {
			error = e?.message || "Couldn't send a code";
		} finally {
			busy = false;
		}
	}

	async function verifyCode() {
		if (busy || code.length < 6) return;
		busy = true;
		error = "";
		try {
			await signInWithCode(email, code);
			await onSignedIn();
		} catch (e: any) {
			error = e?.message || "Couldn't sign in";
			code = "";
		} finally {
			busy = false;
		}
	}

	function useDifferentEmail() {
		stopResendTimer();
		step = "email";
		code = "";
		error = "";
	}

	onDestroy(stopResendTimer);
</script>

<section class="rounded-[28px] bg-white/[0.04] p-6 flex flex-col gap-5">
	<div>
		<h3 class="text-white text-xl font-semibold">Sign in</h3>
		{#if step === "email"}
			<p class="text-white/60 text-sm">
				Back up your library and keep it in sync across devices. We'll email you a code to sign in.
			</p>
		{:else}
			<p class="text-white/60 text-sm">
				Enter the 6-digit code we sent to <span class="text-white">{email.trim()}</span>.
			</p>
		{/if}
	</div>

	{#if step === "email"}
		<form class="flex flex-col gap-3 sm:flex-row" on:submit|preventDefault={sendCode}>
			<input
				type="email"
				autocomplete="email"
				bind:value={email}
				placeholder="you@example.com"
				class="min-h-11 flex-1 min-w-0 rounded-2xl bg-white/8 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:bg-white/12"
				disabled={busy}
			/>
			<button
				type="submit"
				class="bg-white text-black px-6 py-3 rounded-2xl font-semibold hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
				disabled={busy || !email.trim()}
			>
				{busy ? "Sending..." : "Send code"}
			</button>
		</form>
	{:else}
		<form class="flex flex-col gap-4" on:submit|preventDefault={verifyCode}>
			<CodeInput
				bind:value={code}
				disabled={busy}
				on:complete={(event) => {
					code = event.detail.value;
					verifyCode();
				}}
			/>
			<button
				type="submit"
				class="w-full bg-white text-black px-6 py-3 rounded-2xl font-semibold hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
				disabled={busy || code.length < 6}
			>
				{busy ? "Signing in..." : "Sign in"}
			</button>
			<div class="flex flex-wrap items-center justify-between gap-3 text-sm">
				<button
					type="button"
					class="text-white/60 hover:text-white transition-colors cursor-pointer"
					on:click={useDifferentEmail}
				>
					Use a different email
				</button>
				<button
					type="button"
					class="text-white/60 hover:text-white transition-colors cursor-pointer disabled:text-white/30 disabled:cursor-default"
					disabled={busy || resendIn > 0}
					on:click={sendCode}
				>
					{resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
				</button>
			</div>
		</form>
	{/if}

	{#if error}
		<div class="p-3 rounded-2xl bg-red-500/12 text-red-200 text-sm">{error}</div>
	{/if}
</section>
