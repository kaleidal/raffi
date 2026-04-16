<script lang="ts">
  import About from "./components/sections/About.svelte";
  import Download from "./components/sections/Download.svelte";

  const screenshots = [
    "/screenshots/ss1.png",
    "/screenshots/ss2.png",
    "/screenshots/ss3.png",
    "/screenshots/ss4.png",
    "/screenshots/ss5.png",
    "/screenshots/ss6.png"
  ];

  const links = {
    source: "https://github.com/kaleidal/raffi",
    donate: "https://ko-fi.com/kaleidal",
    privacy: "/privacy/index.html"
  } as const;

  let activeScreenshot = $state(0);

  function setActiveScreenshot(next: number) {
    if (next < 0 || next >= screenshots.length) return;
    activeScreenshot = next;
  }
</script>

<div class="min-h-dvh bg-white text-black selection:bg-black selection:text-white">
  <div class="pointer-events-none fixed inset-0">
    <div
      class="absolute inset-0 opacity-[0.20]"
      style="background-image: radial-gradient(#a3a3a3 1px, transparent 1px); background-size: 26px 26px;"
    ></div>
  </div>

  <header class="sticky top-0 z-20">
    <div class="bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/55">
      <div class="mx-auto max-w-6xl px-6">
        <div class="flex h-16 items-center justify-between">
        <a href="#top" class="flex items-center gap-3 font-poppins text-[15px] tracking-[-0.01em]">
          <img src="/raffi.svg" alt="Raffi" class="h-6 w-6" />
          <span class="font-semibold">Raffi</span>
        </a>
        <nav class="flex items-center gap-6 text-[13px] text-neutral-600">
          <a class="hover:text-black" href="#about">What it is</a>
          <a class="hover:text-black" href="#download">Download</a>
          <a class="hover:text-black" href={links.source} target="_blank" rel="noreferrer">Source</a>
        </nav>
        </div>
        <div class="h-px bg-black/5"></div>
      </div>
    </div>
  </header>

  <main id="top" class="relative">
    <section class="pt-14 pb-14 md:pt-20 md:pb-20">
      <div class="mx-auto max-w-6xl px-6">
        <div class="relative grid gap-10">
          <div class="max-w-2xl">
          <h1 class="font-poppins text-[44px] leading-[1.02] tracking-[-0.04em] md:text-[64px]">
            A modern desktop media player
            <span class="text-neutral-400"> that respects your time.</span>
          </h1>
          <p class="mt-6 text-[15px] leading-6 text-neutral-600 md:text-[16px] md:leading-7">
            Fast navigation, legible stream info, and a calmer layout — while keeping the Stremio addon ecosystem.
          </p>

          <div class="mt-7 flex flex-wrap items-center gap-3">
            <a
              href="#download"
              class="inline-flex h-10 items-center rounded-xl bg-black px-5 text-[13px] font-medium text-white hover:bg-black/90"
            >
              Download
            </a>
            <a
              class="inline-flex h-10 items-center rounded-xl px-5 text-[13px] font-medium text-black ring-1 ring-black/10 hover:ring-black/20"
              href={links.source}
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
          </div>
        </div>
      </div>

      <!-- Wider-than-sections media block -->
      <div class="mt-10">
        <div class="mx-auto max-w-[92rem] px-4 sm:px-6">
          <!-- Desktop collage: one large + a tight right strip -->
          <div class="hidden md:grid md:grid-cols-[1fr_220px] md:gap-4 aspect-video">
            <div class="relative min-w-0 overflow-hidden rounded-3xl bg-neutral-950 ring-1 ring-black/5 shadow-[0_18px_50px_-34px_rgba(0,0,0,0.35)]">
              <img
                src={screenshots[activeScreenshot]}
                alt=""
                class="absolute inset-0 h-full w-full object-cover blur-xl opacity-70 scale-[1.06]"
                aria-hidden="true"
                loading="eager"
                decoding="async"
              />
              <div class="absolute inset-0 bg-black/35" aria-hidden="true"></div>
              <img
                src={screenshots[activeScreenshot]}
                alt="Raffi screenshot"
                class="relative h-full w-full object-contain"
                loading="eager"
                decoding="async"
              />
            </div>
            <div class="h-full overflow-y-auto pr-1 [scrollbar-width:thin]">
              <div class="flex h-full flex-col gap-3">
                {#each screenshots as src, i (src)}
                  <button
                    type="button"
                    onclick={() => setActiveScreenshot(i)}
                    class="group relative block w-full overflow-hidden rounded-3xl bg-neutral-100 ring-1 ring-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30 {activeScreenshot === i ? 'ring-black/20' : ''}"
                    aria-label="Show screenshot {i + 1}"
                  >
                    <img
                      {src}
                      alt=""
                      class="aspect-video w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.01]"
                      loading="lazy"
                      decoding="async"
                    />
                    <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 via-black/0 to-black/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
                    {#if activeScreenshot === i}
                      <div class="pointer-events-none absolute inset-0 ring-2 ring-black/20"></div>
                    {/if}
                  </button>
                {/each}
              </div>
            </div>
          </div>

          <!-- Mobile: big shot + scrollable strip -->
          <div class="md:hidden">
            <div class="overflow-hidden rounded-3xl bg-neutral-100 ring-1 ring-black/5 shadow-[0_18px_50px_-34px_rgba(0,0,0,0.35)]">
              <img
                src={screenshots[activeScreenshot]}
                alt="Raffi screenshot"
                class="aspect-video w-full object-cover"
                loading="eager"
                decoding="async"
              />
            </div>
            <div class="mt-4 -mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
              <div class="flex gap-3">
                {#each screenshots as src, i (src)}
                  <button
                    type="button"
                    onclick={() => setActiveScreenshot(i)}
                    class="w-[220px] shrink-0 overflow-hidden rounded-3xl bg-neutral-100 ring-1 ring-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30 {activeScreenshot === i ? 'ring-black/20' : ''}"
                    aria-label="Show screenshot {i + 1}"
                  >
                    <img
                      {src}
                      alt=""
                      class="aspect-video w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  </button>
                {/each}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="about" class="mx-auto max-w-6xl px-6 py-14 md:py-20">
      <About />
    </section>

    <section id="download" class="mx-auto max-w-6xl px-6 py-14 md:py-20">
      <Download />
    </section>
  </main>

  <footer class="mx-auto max-w-6xl px-6 pb-14">
    <div class="h-px bg-black/5"></div>
    <div class="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <p class="text-[13px] text-neutral-500">© {new Date().getFullYear()} Raffi</p>
      <div class="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-neutral-600">
        <a class="hover:text-black" href={links.privacy}>Privacy</a>
        <a class="hover:text-black" href={links.donate} target="_blank" rel="noreferrer">Donate</a>
        <a class="hover:text-black" href={links.source} target="_blank" rel="noreferrer">Source</a>
      </div>
    </div>
  </footer>
</div>

<style>
</style>
