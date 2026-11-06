<script lang="ts">
  import { SCHELF, SOURCE, SPONSOR } from "../lib/links";
  import Mark from "./Mark.svelte";
</script>

<footer class="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between">
  <div class="flex items-center gap-3">
    <Mark class="h-5 w-auto" />
    <span>Open source under the MIT license</span>
  </div>
  <div class="flex flex-wrap gap-x-6 gap-y-2">
    <a class="transition-colors hover:text-ink" href="/privacy/">Privacy</a>
    <a class="transition-colors hover:text-ink" href="mailto:hello@kaleid.al">Contact</a>
    <a class="transition-colors hover:text-ink" href={SCHELF} target="_blank" rel="noreferrer">Schelf</a>
    <a class="transition-colors hover:text-ink" href={SPONSOR} target="_blank" rel="noreferrer">Sponsor</a>
    <a class="transition-colors hover:text-ink" href={SOURCE} target="_blank" rel="noreferrer">GitHub</a>
  </div>
</footer>
