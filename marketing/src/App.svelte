<script lang="ts">
  import Footer from "./components/Footer.svelte";
  import Header from "./components/Header.svelte";
  import Download from "./components/sections/Download.svelte";
  import Features from "./components/sections/Features.svelte";
  import Hero from "./components/sections/Hero.svelte";
  import Privacy from "./pages/Privacy.svelte";

  const isPrivacyPage = typeof window !== "undefined" && window.location.pathname.startsWith("/privacy");
</script>

{#if isPrivacyPage}
  <Header />
  <Privacy />
  <Footer />
{:else}
  <Header />
  <main>
    <Hero />
    <Features />
    <Download />
  </main>
  <Footer />
{/if}
