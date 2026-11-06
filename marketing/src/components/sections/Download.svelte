<script lang="ts">
  import { SYSTEMS, WEB_APP } from "../../lib/downloads";
  import { SOURCE } from "../../lib/links";
  import Mark from "../Mark.svelte";
</script>

<section id="download" class="mt-24 bg-well/60 py-20 md:mt-40 md:py-32">
  <div class="mx-auto max-w-6xl px-6">
    <Mark class="h-12 w-auto text-ink" />
    <h2 class="mt-8 max-w-3xl text-[36px] leading-[1.1] font-semibold tracking-[-0.03em] text-balance md:text-[56px]">
      Get Raffi, then bring your addons.
    </h2>
    <p class="mt-5 max-w-2xl text-lg leading-8 text-ink-soft">
      Raffi doesn't come with anything to stream. What you can watch depends on the addons you add.
    </p>

    <div class="mt-14 grid gap-x-14 gap-y-10 md:grid-cols-3">
      {#each SYSTEMS as system (system.id)}
        <div>
          <h3 class="text-2xl font-semibold tracking-tight">{system.name}</h3>
          <p class="mt-1 h-6 text-sm text-ink-muted">{"note" in system ? system.note : ""}</p>
          <a
            href={system.primary.href}
            class="mt-3 inline-flex h-12 items-center rounded-full bg-pill px-6 font-semibold text-pill-ink transition-opacity hover:opacity-85"
          >
            Download {system.primary.label}
          </a>
          <p class="mt-3 flex gap-4 text-sm text-ink-soft">
            {#each system.others as other (other.label)}
              <a class="underline underline-offset-4 transition-colors hover:text-ink" href={other.href}>{other.label}</a>
            {/each}
          </p>
        </div>
      {/each}
    </div>

    <p class="mt-14 max-w-3xl leading-7 text-ink-soft">
      Or use <a class="font-medium text-ink underline underline-offset-4" href={WEB_APP}>Raffi on the web</a>, which works with hosts that allow browsers. The Android app for phones and TVs can be
      <a class="font-medium text-ink underline underline-offset-4" href="{SOURCE}/tree/main/apps/android" target="_blank" rel="noreferrer">built from source</a>.
    </p>
    <p class="mt-3 max-w-3xl text-sm leading-6 text-ink-muted">
      Windows and macOS builds aren't code-signed, so your system may warn you before opening them.
    </p>
  </div>
</section>
