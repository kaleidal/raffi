<script lang="ts">
    import { fly } from "svelte/transition";
    import { currentUser, signInChangeNotice } from "../../lib/stores/authStore";

    const dismiss = () => signInChangeNotice.set(null);
</script>

{#if $signInChangeNotice}
    <div
        class="fixed bottom-6 left-1/2 z-[450] w-[min(440px,calc(100vw-32px))] -translate-x-1/2 rounded-[28px] bg-[#161616]/92 backdrop-blur-xl p-5 flex flex-col gap-4 shadow-[0_30px_100px_rgba(0,0,0,0.5)]"
        role="status"
        transition:fly={{ y: 24, duration: 250 }}
    >
        {#if $signInChangeNotice === "signed-in"}
            <div class="flex flex-col gap-1.5">
                <p class="text-white text-lg font-semibold">Same account, new sign-in</p>
                <p class="text-white/60 text-sm">
                    From now on you'll sign in with a code sent to {$currentUser?.email ?? "your email"}, the same email as your Ave ID. Your library, lists, and settings are right where you left them.
                </p>
            </div>
        {:else}
            <div class="flex flex-col gap-1.5">
                <p class="text-white text-lg font-semibold">Sign in with your email</p>
                <p class="text-white/60 text-sm">
                    Raffi now signs you in with a code sent to your email. Open Settings and use the same email as your Ave ID to pick up where you left off.
                </p>
            </div>
        {/if}
        <button
            class="self-end px-4 py-2 rounded-2xl bg-white text-black font-semibold hover:bg-white/90 transition-colors cursor-pointer"
            on:click={dismiss}
        >
            Got it
        </button>
    </div>
{/if}
