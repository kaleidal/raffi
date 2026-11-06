<script lang="ts">
  import { onMount } from "svelte";
  import { detectSystem, systemOf, WEB_APP, type SystemId } from "../../lib/downloads";

  let system = $state<SystemId>("windows");
  const details = $derived(systemOf(system));

  onMount(() => {
    system = detectSystem();
  });
</script>

<section class="mx-auto max-w-6xl px-6 pt-12 md:pt-20">
  <h1 class="max-w-4xl text-[44px] leading-[1.05] font-semibold tracking-[-0.035em] text-balance md:text-[76px]">
    Your addons, finally in a good player.
  </h1>
  <p class="mt-6 max-w-2xl text-lg leading-8 text-ink-soft md:text-xl md:leading-9">
    Raffi turns the Stremio addons you already use into one library, with a fast player, watch parties and Trakt.
  </p>
  <div class="mt-9 flex flex-wrap items-center gap-3">
    <a
      href={details.primary.href}
      class="inline-flex h-14 items-center rounded-full bg-pill px-8 text-base font-semibold text-pill-ink transition-opacity hover:opacity-85"
    >
      Download for {details.name}
    </a>
    <a
      href={WEB_APP}
      class="inline-flex h-14 items-center rounded-full bg-well px-8 text-base font-semibold text-ink transition-opacity hover:opacity-75"
    >
      Open in your browser
    </a>
  </div>
</section>

<div class="mx-auto mt-14 max-w-[88rem] px-4 sm:px-6 md:mt-20">
  <img
    src="/screenshots/ss1.png"
    width="1744"
    height="984"
    alt="Raffi's home screen, with a featured film and a row of shows to continue watching"
    class="w-full rounded-[28px] md:rounded-[40px]"
    fetchpriority="high"
  />
</div>
