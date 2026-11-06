<script lang="ts">
  import { onMount } from "svelte";

  const STORAGE_KEY = "raffi-theme";
  let dark = $state(true);

  onMount(() => {
    const chosen = document.documentElement.dataset.theme;
    dark = chosen ? chosen === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  });

  function toggle() {
    dark = !dark;
    const theme = dark ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
  }
</script>

<button
  type="button"
  onclick={toggle}
  aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
  class="grid size-10 cursor-pointer place-items-center rounded-full bg-well text-ink transition-colors hover:text-accent"
>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-[18px]" aria-hidden="true">
    {#if dark}
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    {:else}
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    {/if}
  </svg>
</button>
