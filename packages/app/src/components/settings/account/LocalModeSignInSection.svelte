<script lang="ts">
	import { onDestroy } from "svelte";
	import CodeInput from "../../common/controls/CodeInput.svelte";
	import { sendSignInCode, signInWithCode } from "../../../lib/stores/authStore";

	let { onSignedIn }: { onSignedIn: () => void | Promise<void> } = $props();

	const RESEND_DELAY_SECONDS = 30;

	let step = $state<"email" | "code">("email");
	let email = $state("");
	let code = $state("");
	let busy = $state(false);
	let error = $state("");
	let resendIn = $state(0);
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

<section class="flex max-w-xl flex-col gap-5">
	<div>
		<h3 class="text-ink text-lg font-semibold">Sign in to sync</h3>
		{#if step === "email"}
			<p class="text-ink/60 text-sm">
				Keep your library on every device. We'll email you a code.
			</p>
		{:else}
			<p class="text-ink/60 text-sm">
				Enter the 6-digit code we sent to <span class="text-ink">{email.trim()}</span>.
			</p>
		{/if}
	</div>

	{#if step === "email"}
		<form class="flex flex-col gap-3 sm:flex-row" onsubmit={(event) => (event.preventDefault(), sendCode())}>
			<input
				type="email"
				autocomplete="email"
				bind:value={email}
				placeholder="you@example.com"
				class="min-h-11 flex-1 min-w-0 rounded-full bg-ink/8 px-4 text-sm text-ink outline-none placeholder:text-ink/30 focus:bg-ink/12"
				disabled={busy}
			/>
			<button
				type="submit"
				class="bg-accent text-on-accent px-6 py-3 rounded-full font-semibold hover:bg-accent/85 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
				disabled={busy || !email.trim()}
			>
				{busy ? "Sending..." : "Send code"}
			</button>
		</form>
	{:else}
		<form class="flex flex-col gap-4" onsubmit={(event) => (event.preventDefault(), verifyCode())}>
			<CodeInput
				bind:value={code}
				disabled={busy}
				onComplete={verifyCode}
			/>
			<button
				type="submit"
				class="w-full bg-accent text-on-accent px-6 py-3 rounded-full font-semibold hover:bg-accent/85 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
				disabled={busy || code.length < 6}
			>
				{busy ? "Signing in..." : "Sign in"}
			</button>
			<div class="flex flex-wrap items-center justify-between gap-3 text-sm">
				<button
					type="button"
					class="text-ink/60 hover:text-ink transition-colors cursor-pointer"
					onclick={useDifferentEmail}
				>
					Use a different email
				</button>
				<button
					type="button"
					class="text-ink/60 hover:text-ink transition-colors cursor-pointer disabled:text-ink/30 disabled:cursor-default"
					disabled={busy || resendIn > 0}
					onclick={sendCode}
				>
					{resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
				</button>
			</div>
		</form>
	{/if}

	{#if error}
		<div class="p-3 rounded-2xl bg-danger/12 text-danger text-sm">{error}</div>
	{/if}
</section>
