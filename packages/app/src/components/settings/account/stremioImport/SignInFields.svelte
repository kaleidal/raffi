<script lang="ts">
    import CheckMark from "./CheckMark.svelte";

    export let email: string;
    export let password: string;
    export let keepConnected: boolean;
    export let disabled = false;
</script>

<label class="flex flex-col gap-2">
    <span class="text-xs text-ink/45">Email</span>
    <input
        type="email"
        autocomplete="username"
        bind:value={email}
        placeholder="you@example.com"
        class="min-h-11 rounded-2xl bg-ink/8 px-4 text-sm text-ink outline-none placeholder:text-ink/30 focus:bg-ink/12"
        {disabled}
    />
</label>

<label class="flex flex-col gap-2">
    <span class="text-xs text-ink/45">Password</span>
    <input
        type="password"
        autocomplete="current-password"
        bind:value={password}
        placeholder="Stremio password"
        class="min-h-11 rounded-2xl bg-ink/8 px-4 text-sm text-ink outline-none placeholder:text-ink/30 focus:bg-ink/12"
        {disabled}
    />
</label>

<label class="flex items-start gap-3 cursor-pointer select-none">
    <input
        type="checkbox"
        bind:checked={keepConnected}
        class="sr-only"
        {disabled}
    />
    <CheckMark checked={keepConnected} />
    <span class="text-sm text-ink/70 leading-snug">
        Keep connected so you can sync again from settings without signing in each time.
    </span>
</label>
