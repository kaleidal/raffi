<script lang="ts">
	import { onMount } from "svelte";
	import {
		getAnalyticsSettings,
		isAnalyticsAvailable,
		setAnalyticsSettings,
		trackEvent,
	} from "../../../../lib/analytics";

	let analyticsEnabled = false;
	let sessionReplayEnabled = false;
	let analyticsAvailable = false;

	onMount(() => {
		analyticsAvailable = isAnalyticsAvailable();
		const analyticsSettings = getAnalyticsSettings();
		analyticsEnabled = analyticsSettings.enabled;
		sessionReplayEnabled = analyticsSettings.sessionReplay;
	});

	function toggleAnalytics() {
		analyticsEnabled = !analyticsEnabled;
		if (!analyticsEnabled) {
			sessionReplayEnabled = false;
		}
		setAnalyticsSettings({
			enabled: analyticsEnabled,
			sessionReplay: sessionReplayEnabled,
		});
		trackEvent("analytics_toggled", { enabled: analyticsEnabled });
	}

	function toggleSessionReplay() {
		if (!analyticsEnabled) return;
		sessionReplayEnabled = !sessionReplayEnabled;
		setAnalyticsSettings({
			enabled: analyticsEnabled,
			sessionReplay: sessionReplayEnabled,
		});
		trackEvent("session_replay_toggled", {
			enabled: sessionReplayEnabled,
		});
	}
</script>

<section class="rounded-[28px] bg-white/[0.04] p-6 flex flex-col gap-5">
	<div>
		<h3 class="text-white text-xl font-semibold">
			Privacy & Analytics
		</h3>
		<p class="text-white/60 text-sm">
			Help improve Raffi while keeping control of your data.
		</p>
	</div>
	<div class="rounded-2xl bg-white/[0.08] p-4 flex flex-wrap items-center gap-4 justify-between">
		<div>
			<p class="text-white font-medium">
				Share anonymous analytics
			</p>
			<p class="text-white/60 text-sm">
				Tracks feature usage and stream types without collecting titles or URLs.
			</p>
		</div>
		<button
			class={`relative w-16 h-9 rounded-full border border-white/10 transition-colors duration-200 ${analyticsAvailable ? "cursor-pointer" : "cursor-not-allowed opacity-50"} ${analyticsEnabled ? "bg-white" : "bg-white/10"}`}
			on:click={toggleAnalytics}
			disabled={!analyticsAvailable}
			aria-label="Toggle analytics"
			role="switch"
			aria-checked={analyticsEnabled}
		>
			<span
				class={`absolute top-1 left-1 w-7 h-7 rounded-full text-[10px] font-semibold tracking-[0.2em] flex items-center justify-center transition-all duration-200 ${analyticsEnabled ? "translate-x-7 bg-black text-white/90" : "translate-x-0 bg-white/80 text-black"}`}
			>
				{analyticsEnabled ? "ON" : "OFF"}
			</span>
		</button>
	</div>
	<div class="rounded-2xl bg-white/[0.08] p-4 flex flex-wrap items-center gap-4 justify-between">
		<div>
			<p class="text-white font-medium">
				Session replay
			</p>
			<p class="text-white/60 text-sm">
				Records UI flows to debug issues. Text inputs are masked.
			</p>
		</div>
		<button
			class={`relative w-16 h-9 rounded-full border border-white/10 transition-colors duration-200 ${analyticsAvailable && analyticsEnabled ? "cursor-pointer" : "cursor-not-allowed opacity-50"} ${sessionReplayEnabled ? "bg-white" : "bg-white/10"}`}
			on:click={toggleSessionReplay}
			disabled={!analyticsAvailable || !analyticsEnabled}
			aria-label="Toggle session replay"
			role="switch"
			aria-checked={sessionReplayEnabled}
		>
			<span
				class={`absolute top-1 left-1 w-7 h-7 rounded-full text-[10px] font-semibold tracking-[0.2em] flex items-center justify-center transition-all duration-200 ${sessionReplayEnabled ? "translate-x-7 bg-black text-white/90" : "translate-x-0 bg-white/80 text-black"}`}
			>
				{sessionReplayEnabled ? "ON" : "OFF"}
			</span>
		</button>
	</div>
	{#if !analyticsAvailable}
		<p class="text-white/50 text-sm">
			Analytics is not configured for this build.
		</p>
	{/if}
</section>
