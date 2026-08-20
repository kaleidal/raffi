<script lang="ts">
  const updatedAt = "August 20, 2026";

  const sections = [
    { id: "scope", label: "Scope and operator" },
    { id: "information", label: "Information we handle" },
    { id: "use", label: "How we use information" },
    { id: "services", label: "Services and integrations" },
    { id: "streaming", label: "Streaming and torrents" },
    { id: "retention", label: "Storage and retention" },
    { id: "choices", label: "Your choices and rights" },
    { id: "security", label: "Security and transfers" },
    { id: "children", label: "Children" },
    { id: "changes", label: "Changes and contact" }
  ] as const;
</script>

<svelte:head>
  <title>Privacy — Raffi</title>
  <meta
    name="description"
    content="How Raffi handles account, playback, local-device, and integration data."
  />
</svelte:head>

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
          <a href="/" class="flex items-center gap-3 font-poppins text-[15px] tracking-[-0.01em]">
            <img src="/raffi.svg" alt="" class="h-6 w-6" />
            <span class="font-semibold">Raffi</span>
          </a>
          <nav class="flex items-center gap-6 text-[13px] text-neutral-600">
            <a class="hover:text-black" href="/">Home</a>
            <a
              class="hover:text-black"
              href="https://github.com/kaleidal/raffi"
              target="_blank"
              rel="noreferrer"
            >Source</a>
          </nav>
        </div>
        <div class="h-px bg-black/5"></div>
      </div>
    </div>
  </header>

  <main class="relative">
    <section class="mx-auto max-w-6xl px-6 pb-14 pt-14 md:pb-20 md:pt-20">
      <div class="max-w-3xl">
        <h1 class="font-poppins text-[44px] leading-[1.02] tracking-[-0.04em] md:text-[64px]">
          Privacy,
          <span class="text-neutral-400">without the fog.</span>
        </h1>
        <p class="mt-6 max-w-2xl text-[15px] leading-6 text-neutral-600 md:text-[16px] md:leading-7">
          Raffi works locally without an account. If you choose cloud sync or connect another service,
          this policy explains what moves off your device, why, and how you can stop it.
        </p>
        <p class="mt-5 text-[13px] text-neutral-500">Last updated {updatedAt}</p>
      </div>

      <div class="mt-12 grid gap-8 border-y border-black/5 py-8 sm:grid-cols-3 sm:gap-10">
        <div>
          <p class="font-poppins text-[18px] font-medium tracking-[-0.02em]">Local by default</p>
          <p class="mt-2 text-[14px] leading-6 text-neutral-600">An account is optional. Local mode keeps your library and preferences on your device.</p>
        </div>
        <div>
          <p class="font-poppins text-[18px] font-medium tracking-[-0.02em]">No analytics</p>
          <p class="mt-2 text-[14px] leading-6 text-neutral-600">Raffi does not use advertising trackers, behavioral analytics, or sell personal information.</p>
        </div>
        <div>
          <p class="font-poppins text-[18px] font-medium tracking-[-0.02em]">Integrations are optional</p>
          <p class="mt-2 text-[14px] leading-6 text-neutral-600">Trakt, Stremio, Discord, direct players, and torrenting are features you control.</p>
        </div>
      </div>
    </section>

    <div class="mx-auto grid max-w-6xl gap-12 px-6 pb-20 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-20">
      <aside class="hidden lg:block">
        <nav class="sticky top-24" aria-label="Privacy policy sections">
          <p class="mb-4 text-[13px] font-medium text-neutral-900">On this page</p>
          <ol class="space-y-2.5 text-[13px] leading-5 text-neutral-500">
            {#each sections as section, index}
              <li>
                <a class="group flex gap-3 hover:text-black" href={`#${section.id}`}>
                  <span class="w-5 shrink-0 text-neutral-300 group-hover:text-neutral-500">{String(index + 1).padStart(2, "0")}</span>
                  <span>{section.label}</span>
                </a>
              </li>
            {/each}
          </ol>
        </nav>
      </aside>

      <article class="min-w-0 max-w-3xl text-[15px] leading-7 text-neutral-700">
        <section id="scope" class="scroll-mt-24">
          <h2>Scope and operator</h2>
          <p>
            This policy covers the Raffi desktop app, web app, sync service, and website. “Raffi,” “we,” and
            “our” refer to the Raffi project operated by Kaleidal. Questions and privacy requests can be sent to
            <a href="mailto:hello@kaleid.al">hello@kaleid.al</a>.
          </p>
          <p>
            Raffi is open source. Its source code and the services it connects to can be reviewed in the
            <a href="https://github.com/kaleidal/raffi" target="_blank" rel="noreferrer">public repository</a>.
          </p>
        </section>

        <section id="information" class="scroll-mt-24">
          <h2>Information we handle</h2>

          <h3>On your device</h3>
          <p>Raffi may store the following locally so the app can work and remember your choices:</p>
          <ul>
            <li>your library, lists, watch progress, installed add-ons, direct-source settings, and preferences;</li>
            <li>cached metadata, posters, subtitles you upload, downloads, and playback state;</li>
            <li>desktop library locations, file paths, and the local index used to play files you select;</li>
            <li>desktop diagnostic logs containing runtime details and operational errors;</li>
            <li>Ave session tokens when you sign in; and</li>
            <li>a Stremio email address and session key if you choose to remain connected.</li>
          </ul>
          <p>
            A Stremio password is sent directly from your device to Stremio to create a session. Raffi does not
            store that password. A subtitle file you upload is used for local playback and is not uploaded to
            Raffi’s sync service.
          </p>

          <h3>In Raffi cloud sync</h3>
          <p>If you sign in and leave local mode, Raffi stores the data needed to provide synchronization:</p>
          <ul>
            <li>your Ave user ID and, when available, email address, profile name, and avatar;</li>
            <li>installed add-on addresses and manifests;</li>
            <li>title identifiers, posters, watch progress, completion state, and timestamps;</li>
            <li>lists, list items, and synchronized preferences;</li>
            <li>temporary watch-party membership and playback state; and</li>
            <li>Trakt account identifiers and OAuth tokens if you connect Trakt.</li>
          </ul>
          <p>Raffi does not upload your video files, downloaded media, local file paths, or uploaded subtitle files to cloud sync.</p>

          <h3>Technical information</h3>
          <p>
            When you contact Raffi’s website or sync service, hosting providers may process ordinary request data
            such as your IP address, user agent, request time, and error information for delivery, abuse prevention,
            and reliability. Raffi does not use this information for advertising or behavioral profiling.
          </p>
        </section>

        <section id="use" class="scroll-mt-24">
          <h2>How we use information</h2>
          <p>We use information only to:</p>
          <ul>
            <li>authenticate you and maintain your session;</li>
            <li>sync your library, lists, settings, and watch progress;</li>
            <li>run watch parties and the integrations you request;</li>
            <li>find metadata, subtitles, and playback sources through providers you use;</li>
            <li>deliver downloads and application updates; and</li>
            <li>protect, debug, and operate Raffi.</li>
          </ul>
          <p>
            Where data-protection law requires a legal basis, we rely on providing the service you request,
            your choice to enable optional integrations, our legitimate interests in securing and operating Raffi,
            and compliance with legal obligations. You can withdraw an optional integration at any time by
            disconnecting or disabling it.
          </p>
        </section>

        <section id="services" class="scroll-mt-24">
          <h2>Services and integrations</h2>
          <p>Raffi shares information with another service only when needed for a feature you use:</p>
          <div class="divide-y divide-black/5 border-y border-black/5">
            <div class="service-row">
              <h3><a href="https://aveid.net/privacy" target="_blank" rel="noreferrer">Ave</a></h3>
              <p>Provides optional OAuth/OIDC sign-in. Ave handles the sign-in flow and returns identity details and session tokens requested by Raffi.</p>
            </div>
            <div class="service-row">
              <h3><a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Cloudflare</a></h3>
              <p>Hosts Raffi’s website, web app, sync database, and watch-party coordination. Cloudflare may process request and security metadata.</p>
            </div>
            <div class="service-row">
              <h3><a href="https://trakt.tv/privacy" target="_blank" rel="noreferrer">Trakt</a></h3>
              <p>If connected, Raffi stores Trakt OAuth tokens and sends title identifiers, media type, and playback progress for scrobbling and recommendations.</p>
            </div>
            <div class="service-row">
              <h3><a href="https://www.stremio.com/privacy" target="_blank" rel="noreferrer">Stremio</a></h3>
              <p>If you import or connect an account, your device communicates with Stremio to retrieve your library and installed add-ons.</p>
            </div>
            <div class="service-row">
              <h3>Add-ons, metadata, subtitles, and players</h3>
              <p>Requests may include title identifiers, season and episode numbers, search terms, playback position, and ordinary network metadata. Third-party embedded players can set or read data under their own policies.</p>
            </div>
            <div class="service-row">
              <h3><a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">YouTube</a> and <a href="https://discord.com/privacy" target="_blank" rel="noreferrer">Discord</a></h3>
              <p>YouTube’s privacy-enhanced domain provides trailers. Discord Rich Presence is enabled by default on desktop and can be disabled in settings. While enabled, Raffi sends the title you are watching and, when available, playback state and timing to the local Discord client.</p>
            </div>
            <div class="service-row">
              <h3><a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noreferrer">GitHub</a></h3>
              <p>Provides release information, application downloads, update metadata, source code, issue reporting, and community discussions.</p>
            </div>
          </div>
          <p>
            These providers process information under their own terms and privacy policies. A user-installed add-on,
            custom player, debrid service, or other endpoint is selected by the user and is not controlled by Raffi.
          </p>
        </section>

        <section id="streaming" class="scroll-mt-24">
          <h2>Streaming and torrents</h2>
          <p>
            Raffi does not host media or determine whether a source is authorized. Metadata, add-ons, direct players,
            debrid services, and streaming hosts may receive your IP address and the information needed to answer your
            request. Their own policies govern that processing.
          </p>
          <p>
            Torrenting is disabled by default. If you enable it and play a torrent source, your IP address and torrent
            activity may be visible to peers, trackers, a debrid provider, or other participants involved in delivery.
            Only use content and services you are authorized to access.
          </p>
        </section>

        <section id="retention" class="scroll-mt-24">
          <h2>Storage and retention</h2>
          <ul>
            <li>Local data remains on your device until you clear it, sign out where applicable, or uninstall Raffi.</li>
            <li>Ave session data remains locally until you sign out, clear app data, or the session expires or is revoked.</li>
            <li>A saved Stremio session remains locally until you disconnect it or clear app data.</li>
            <li>Trakt tokens remain in Raffi’s sync database until you disconnect Trakt or request deletion.</li>
            <li>Cloud-synced account data remains while your Raffi account data is active or until you request deletion.</li>
            <li>Watch-party state is temporary and is removed when the party ends or expires.</li>
            <li>Infrastructure logs and backups may remain for limited operational, security, and recovery periods set by our service providers.</li>
          </ul>
          <p>
            We may retain information longer when required by law, needed to resolve a dispute, or necessary to protect
            Raffi and its users. We otherwise remove or anonymize information when it is no longer needed for the purpose
            for which it was collected, subject to the limits described above.
          </p>
        </section>

        <section id="choices" class="scroll-mt-24">
          <h2>Your choices and rights</h2>
          <p>You can use Raffi in local mode without creating an account. Within the app, you can also:</p>
          <ul>
            <li>sign out and stop cloud synchronization;</li>
            <li>disconnect Trakt or Stremio;</li>
            <li>disable Discord Rich Presence and torrenting;</li>
            <li>remove add-ons, custom sources, lists, history, downloads, and local-library locations; and</li>
            <li>clear local application data or uninstall Raffi.</li>
          </ul>
          <p>
            Depending on where you live, you may have rights to access, correct, delete, restrict, object to processing,
            or receive a portable copy of personal data. You may also withdraw consent and complain to your local data
            protection authority. Email <a href="mailto:hello@kaleid.al">hello@kaleid.al</a> to make a request. We may
            need to verify your identity before acting on it.
          </p>
          <p>
            Signing out stops future sync but does not by itself delete cloud data. Ask us to delete that data if you
            want it removed. Disconnecting an integration stops future access by Raffi; the provider may separately
            retain information under its own policy.
          </p>
        </section>

        <section id="security" class="scroll-mt-24">
          <h2>Security and international transfers</h2>
          <p>
            Raffi uses encrypted HTTPS connections, scoped authentication, and access controls intended to protect data
            in transit and at rest. No method of storage or transmission is perfectly secure, so we cannot guarantee
            absolute security.
          </p>
          <p>
            Raffi and its providers may process information in countries other than your own. Where required, those
            transfers are handled using the safeguards offered by the relevant provider and applicable law.
          </p>
        </section>

        <section id="children" class="scroll-mt-24">
          <h2>Children</h2>
          <p>
            Raffi is not directed to children who are below the age at which they may independently consent to an online
            service in their country. We do not knowingly collect personal information from children without the
            authorization required by applicable law. Contact us if you believe a child has provided information so we
            can investigate and remove it where appropriate.
          </p>
        </section>

        <section id="changes" class="scroll-mt-24">
          <h2>Changes and contact</h2>
          <p>
            We may update this policy when Raffi’s behavior or legal obligations change. We will revise the date at the
            top and provide additional notice when a change materially affects how personal information is handled.
          </p>
          <div class="mt-8 border-t border-black/5 pt-8">
            <p class="font-poppins text-[18px] font-medium tracking-[-0.02em] text-black">Questions or requests?</p>
            <p class="mt-2">Email <a href="mailto:hello@kaleid.al">hello@kaleid.al</a>.</p>
          </div>
        </section>
      </article>
    </div>
  </main>

  <footer class="relative mx-auto max-w-6xl px-6 pb-14">
    <div class="h-px bg-black/5"></div>
    <div class="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <p class="text-[13px] text-neutral-500">© {new Date().getFullYear()} Raffi</p>
      <div class="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-neutral-600">
        <a class="hover:text-black" href="/">Home</a>
        <a class="hover:text-black" href="mailto:hello@kaleid.al">Contact</a>
        <a class="hover:text-black" href="https://github.com/kaleidal/raffi" target="_blank" rel="noreferrer">Source</a>
      </div>
    </div>
  </footer>
</div>

<style>
  article section + section {
    margin-top: 4.5rem;
  }

  article h2 {
    color: #0a0a0a;
    font-family: "Poppins", sans-serif;
    font-size: clamp(1.65rem, 3vw, 2rem);
    font-weight: 500;
    letter-spacing: -0.03em;
    line-height: 1.15;
    margin-bottom: 1.25rem;
  }

  article h3 {
    color: #171717;
    font-family: "Poppins", sans-serif;
    font-size: 1rem;
    font-weight: 500;
    letter-spacing: -0.015em;
    margin: 2rem 0 0.5rem;
  }

  article p + p,
  article ul + p,
  article p + ul {
    margin-top: 1rem;
  }

  article ul {
    list-style: disc;
    padding-left: 1.25rem;
  }

  article li + li {
    margin-top: 0.35rem;
  }

  article a {
    color: #171717;
    text-decoration-line: underline;
    text-decoration-color: #d4d4d4;
    text-underline-offset: 0.2em;
  }

  article a:hover {
    text-decoration-color: #171717;
  }

  .service-row {
    display: grid;
    gap: 0.25rem;
    padding: 1.25rem 0;
  }

  .service-row h3 {
    margin: 0;
  }

  @media (min-width: 640px) {
    .service-row {
      grid-template-columns: 9rem minmax(0, 1fr);
      gap: 2rem;
    }
  }
</style>
