<script lang="ts">
  import { SOURCE } from "../lib/links";
  import Mark from "./Mark.svelte";
  import ThemeToggle from "./ThemeToggle.svelte";
</script>

<header class="sticky top-0 z-20 bg-canvas/80 backdrop-blur-lg">
  <div class="mx-auto flex h-20 max-w-6xl items-center justify-between px-6">
    <a href="/" class="flex items-center gap-3 text-[17px] font-semibold tracking-tight">
      <Mark class="h-7 w-auto" />
      Raffi
    </a>
    <nav class="flex items-center gap-2 text-sm font-medium sm:gap-7">
      <a class="hidden text-ink-soft transition-colors hover:text-ink sm:block" href="/#features">Features</a>
      <a class="hidden text-ink-soft transition-colors hover:text-ink sm:block" href="/#download">Download</a>
      <a class="hidden text-ink-soft transition-colors hover:text-ink sm:block" href={SOURCE} target="_blank" rel="noreferrer">GitHub</a>
      <ThemeToggle />
    </nav>
  </div>
</header>
