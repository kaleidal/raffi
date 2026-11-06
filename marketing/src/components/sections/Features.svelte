<script lang="ts">
  const rows = [
    {
      title: "A player for the awkward files",
      text: "Dolby, DTS and TrueHD audio that just plays. Pick any audio or subtitle track, preview frames on the seek bar, skip intros, and save clips of the good bits.",
      image: "/screenshots/ss6.png",
      width: 3440,
      height: 1440,
      alt: "Raffi's video player with its controls along the bottom",
    },
    {
      title: "A library that keeps up with you",
      text: "Continue watching, per-episode progress and your own lists, synced across your devices. Or skip the account and keep it all on this one.",
      image: "/screenshots/ss3.png",
      width: 1742,
      height: 980,
      alt: "A Watch later list of film and show posters next to a featured title",
    },
    {
      title: "Every title, properly laid out",
      text: "Trailers, ratings, seasons and episodes in one place, so picking something to watch is the easy part.",
      image: "/screenshots/ss4.png",
      width: 1743,
      height: 980,
      alt: "A show's page with its progress, rating and a Resume button",
    },
  ];

  const extras = [
    {
      title: "Watch together",
      text: "Start a watch party and everyone stays in sync, with the host in control.",
    },
    {
      title: "Trakt",
      text: "Connect with a short code and your progress goes straight to your profile.",
    },
    {
      title: "Torrents with Limbo",
      text: "Stream through Limbo on your computer, or on a paired one from your Android TV.",
    },
    {
      title: "Discord",
      text: "Show friends what you're watching, or turn it off. It's up to you.",
    },
  ];
</script>

<section id="features" class="mx-auto mt-24 max-w-6xl space-y-24 px-6 md:mt-40 md:space-y-40">
  {#each rows as row, index (row.title)}
    <div class="grid items-center gap-8 md:grid-cols-12 md:gap-14">
      <div class={["md:col-span-5", index % 2 === 1 && "md:order-last"]}>
        <h2 class="text-[32px] leading-[1.12] font-semibold tracking-[-0.03em] text-balance md:text-[44px]">{row.title}</h2>
        <p class="mt-5 text-lg leading-8 text-ink-soft">{row.text}</p>
      </div>
      <img
        src={row.image}
        width={row.width}
        height={row.height}
        alt={row.alt}
        loading="lazy"
        decoding="async"
        class="w-full rounded-[24px] md:col-span-7 md:rounded-[32px]"
      />
    </div>
  {/each}

  <div class="grid gap-x-14 gap-y-10 sm:grid-cols-2">
    {#each extras as extra (extra.title)}
      <div>
        <h3 class="text-xl font-semibold tracking-tight">{extra.title}</h3>
        <p class="mt-2 leading-7 text-ink-soft">{extra.text}</p>
      </div>
    {/each}
  </div>
</section>
