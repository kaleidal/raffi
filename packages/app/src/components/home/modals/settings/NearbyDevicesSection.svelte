<script lang="ts">
	import { onMount } from "svelte";
	import QRCode from "qrcode";

	type Device = { id: string; name: string; platform: string; createdAt: string };
	type Challenge = { code: string; expiresAt: string; pairingUrl: string };
	const BASE = "http://127.0.0.1:6969/bridge/v1/admin";
	let enabled = false;
	let loaded = false;
	let saving = false;
	let error = "";
	let devices: Device[] = [];
	let challenge: Challenge | null = null;
	let qrDataUrl = "";

	onMount(() => {
		void refresh().finally(() => { loaded = true; });
	});

	async function request<T>(path: string, init?: RequestInit): Promise<T> {
		const response = await fetch(`${BASE}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
		if (!response.ok) throw new Error((await response.text()) || `Request failed (${response.status})`);
		if (response.status === 204) return null as T;
		return response.json() as Promise<T>;
	}

	async function refresh() {
		try {
			const [settings, paired] = await Promise.all([request<{ enabled: boolean }>("/settings"), request<Device[]>("/devices")]);
			enabled = settings.enabled; devices = paired;
		} catch (e) { error = e instanceof Error ? e.message : String(e); }
	}

	async function toggle() {
		if (!loaded || saving) return;
		const previous = enabled;
		const next = !previous;
		enabled = next;
		saving = true; error = "";
		try {
			const settings = await request<{ enabled: boolean }>("/settings", { method: "PUT", body: JSON.stringify({ enabled: next }) });
			enabled = settings.enabled;
			if (!next) { challenge = null; qrDataUrl = ""; }
		} catch (e) { enabled = previous; error = e instanceof Error ? e.message : String(e); }
		finally { saving = false; }
	}

	async function openPairing() {
		error = "";
		try {
			challenge = await request<Challenge>("/challenge", { method: "POST", body: "{}" });
			qrDataUrl = await QRCode.toDataURL(challenge.pairingUrl, { width: 320, margin: 1, color: { dark: "#050505", light: "#ffffff" } });
		} catch (e) { error = e instanceof Error ? e.message : String(e); }
	}

	async function revoke(id: string) {
		try { await request(`/devices?id=${encodeURIComponent(id)}`, { method: "DELETE" }); await refresh(); }
		catch (e) { error = e instanceof Error ? e.message : String(e); }
	}
</script>

<div class="rounded-2xl bg-white/8 p-4 flex flex-col gap-4">
	<div class="flex flex-wrap items-center gap-4 justify-between">
		<div>
			<p class="text-white font-medium">Allow nearby Raffi devices</p>
			<p class="text-white/60 text-sm">Let paired phones and TVs ask this computer to prepare compatible streams.</p>
			{#if error}<p class="mt-1 text-red-300 text-xs">{error}</p>{/if}
		</div>
		<button class={`relative w-16 h-9 rounded-full border border-white/10 ${enabled ? "bg-white" : "bg-white/10"}`} on:click={toggle} disabled={!loaded || saving} role="switch" aria-checked={enabled} aria-busy={saving}>
			<span class={`absolute top-1 left-1 w-7 h-7 rounded-full text-[10px] font-semibold flex items-center justify-center transition-all ${enabled ? "translate-x-7 bg-black text-white" : "bg-white/80 text-black"}`}>{enabled ? "On" : "Off"}</span>
		</button>
	</div>
	{#if enabled}
		<div class="flex flex-wrap items-center gap-3">
			<button class="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black" on:click={openPairing}>Pair a phone or TV</button>
			<span class="text-white/50 text-xs">Only available on your local network.</span>
		</div>
		{#if devices.length > 0}
			<div class="border-t border-white/10 pt-3 flex flex-col gap-2">
				{#each devices as device}
					<div class="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-3 py-2">
						<div><p class="text-white text-sm font-medium">{device.name}</p><p class="text-white/45 text-xs">{device.platform}</p></div>
						<button class="text-red-200/80 text-xs hover:text-red-100" on:click={() => revoke(device.id)}>Revoke</button>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

{#if challenge}
	<div class="fixed inset-0 z-[100] bg-black/75 backdrop-blur-md flex items-center justify-center p-6" role="presentation" on:click={() => challenge = null}>
		<div class="w-full max-w-md rounded-[28px] bg-[#17191d] border border-white/10 p-7 text-center" role="dialog" aria-modal="true" tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation>
			<h3 class="text-white text-2xl font-semibold">Pair Raffi</h3>
			<p class="mt-2 text-white/55 text-sm">Scan this in Raffi, or enter the code on Android TV.</p>
			{#if qrDataUrl}<img class="mx-auto mt-6 h-64 w-64 rounded-2xl" src={qrDataUrl} alt="Raffi pairing QR code" />{/if}
			<p class="mt-5 text-white text-4xl font-bold tracking-[0.35em] pl-[0.35em]">{challenge.code}</p>
			<p class="mt-2 text-white/45 text-xs">Expires in five minutes and works once.</p>
			<button class="mt-6 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black" on:click={() => challenge = null}>Done</button>
		</div>
	</div>
{/if}
