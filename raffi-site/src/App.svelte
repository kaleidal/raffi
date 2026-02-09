<script lang="ts">
  import HeroButton from "./components/HeroButton.svelte";
  import Screenshots from "./components/sections/Screenshots.svelte";
  import About from "./components/sections/About.svelte";
  import Download from "./components/sections/Download.svelte";

  let scrollY = 0;
  let innerWidth = 0;
  let innerHeight = 0;

  const screenshots = [
    "/screenshots/ss1.png",
    "/screenshots/ss2.png",
    "/screenshots/ss3.png",
    "/screenshots/ss4.png",
    "/screenshots/ss5.png"
  ];

  const SCROLL_TRANSITION_HEIGHT = 800; 
  const PEEK_AMOUNT = 200; 

  let activeSection = 'screenshots';

  function handleNav(section: string) {
      if (section === 'source') {
          window.open('https://github.com/kaleidal/raffi', '_blank'); 
          return;
      }
      if (section === 'donate') {
           window.open('https://ko-fi.com/kaleidal', '_blank');
           return;
      }
      if (section === 'privacy') {
          window.location.href = '/privacy/';
          return;
      }
      
      if (activeSection === section) {
          activeSection = 'screenshots';
      } else {
          activeSection = section;
      }
      
      if (scrollY < SCROLL_TRANSITION_HEIGHT) {
          window.scrollTo({ top: SCROLL_TRANSITION_HEIGHT, behavior: 'smooth' });
      }
  }

  $: transitionProgress = Math.min(scrollY / SCROLL_TRANSITION_HEIGHT, 1);
  
  $: contentTranslateX = -transitionProgress * (innerWidth * 0.25);

  $: screenshotContainerStart = innerWidth - PEEK_AMOUNT;
  $: screenshotContainerEnd = innerWidth * 0.5;
  $: screenshotContainerX = screenshotContainerStart - (transitionProgress * (screenshotContainerStart - screenshotContainerEnd));

  $: isScreenshots = activeSection === 'screenshots';
  $: contentScrollY = isScreenshots ? Math.max(0, scrollY - SCROLL_TRANSITION_HEIGHT) : 0;
  
  $: trackHeight = SCROLL_TRANSITION_HEIGHT + (isScreenshots ? (screenshots.length * 600) : 0) + innerHeight;
</script>

<svelte:window bind:scrollY bind:innerWidth bind:innerHeight />

<div style="height: {trackHeight}px;"></div>

<div class="fixed top-0 left-0 w-full h-full overflow-hidden bg-white text-black">
    <!-- Dot Grid Background -->
    <div class="absolute inset-0 pointer-events-none opacity-[0.4]" 
         style="background-image: radial-gradient(#9ca3af 1px, transparent 1px); background-size: 24px 24px;">
    </div>

    <div 
        class="absolute top-0 left-0 w-full h-full flex flex-col items-center justify-center p-[100px] will-change-transform"
        style="transform: translateX({contentTranslateX}px);"
    >
        <div class="flex flex-col gap-[40px] items-start z-10 w-[500px]">
            <HeroButton text="download" on:click={() => handleNav('download')} />
            <HeroButton text="about" on:click={() => handleNav('about')} />
            <HeroButton text="privacy" on:click={() => handleNav('privacy')} />
            <HeroButton text="donate" on:click={() => handleNav('donate')} />
            <HeroButton text="source" on:click={() => handleNav('source')} />
        </div>
    </div>

    <div 
        class="absolute top-0 w-[50vw] h-full flex flex-col items-center justify-start will-change-transform"
        style="
            left: 0; 
            transform: translateX({screenshotContainerX}px);
        "
    >
        <div 
            class="w-full px-10 will-change-transform relative"
            style="
                padding-top: {innerHeight * 0.25}px;
                transform: translateY({-contentScrollY}px);
            "
        >
            {#if activeSection === 'screenshots'}
                <Screenshots {screenshots} />
            {:else if activeSection === 'about'}
                <About />
            {:else if activeSection === 'download'}
                <Download />
            {/if}
            
            <div style="height: 50vh;"></div>
        </div>
    </div>

</div>

<style>
 :global(body) {
    background-color: black;
    overflow-x: hidden;
 }
 :global(::-webkit-scrollbar) {
  display: none;
}
:global(html) {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
